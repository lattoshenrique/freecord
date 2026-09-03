import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  loadAudioDevicePrefs,
  micDeviceConstraint,
  saveAudioDevicePrefs,
  type AudioDevicePrefs,
} from './audio-devices';
import {
  CAMERA_ADAPTIVE,
  SCREEN_ADAPTIVE,
  advance,
  adaptedEncoding,
  congestionFromReports,
  factorFor,
  initialAdaptiveState,
} from './adaptive-policy';
import { CAMERA_MIN_BITRATE, cameraEncoding, composeCameraEncoding } from './camera-quality';
import { decodeChatBody, encodeChatBody, type ChatQuote } from './chat-body';
import { ChatChannels, normalizeChatText } from './chat-channel';
import { importRoomKey, openChat, sealChat } from './chat-crypto';
import { FileTransfers, type FileTransfer } from './file-transfer';
import { heroTransition } from './hero-transition';
import { LinkHealthTracker } from './link-health';
import { Mesh, type TrackEncoding } from './mesh';
import { playJoinChime, playLeaveChime } from './notification-sound';
import { Signaling } from './signaling';
import { cameraSlotsFor, type PeerInfo, type ServerMessage } from './protocol';
import {
  DEFAULT_SCREEN_QUALITY,
  SCREEN_MIN_BITRATE,
  bitrateFor,
  presetById,
  screenCodecPreferences,
  screenConstraints,
  type ScreenQualityId,
} from './screen-quality';
import {
  loadParticipation,
  makeScreenRefusal,
  mayRefuse,
  saveParticipation,
  extractScreenRefusal,
  sendingTargets,
  type Participation,
} from './participation';
import {
  ScreenRelayController,
  extractRelayNote,
  makeMissingNote,
  makeRelayNote,
} from './screen-relay';
import {
  advanceAudioStall,
  advanceMissing,
  advanceStall,
  initialStallState,
  type StallState,
} from './stall-watch';
import { guardCapture, type GuardedCapture } from './audio-bus';
import type { EchoGuardStats } from './echo-guard';
import {
  applyBestMicProcessing,
  allowHiFiOpus,
  cameraConstraints,
  cameraEncoding as cameraUserCaps,
  cameraPresetById,
  loadMediaSettings,
  micConstraints,
  micContentHint,
  micEncoding,
  nativeScreenAudioGuardActive,
  saveMediaSettings,
  screenAudioConstraints,
  screenAudioEncoding,
  SCREEN_AUDIO_CONTENT_HINT,
  type MediaSettings,
} from './media-settings';
import { StatsSampler, senderReports, type PeerLatency, type ScreenStats } from './stats';

export interface JoinOptions {
  slug: string;
  name: string;
  micEnabled: boolean;
  camEnabled: boolean;
  /** Room key from the invite link's fragment; null joins without one. */
  roomKey: string | null;
}

/** One screen being shared in the room, as the server announced it. */
export interface ScreenShare {
  id: string;
  streamId: string;
}

/** This peer's role in one screen's forwarding tree (see `screen-route`). */
interface ScreenRoute {
  children: string[];
  source: { id: string; streamId: string } | null;
  quality: ScreenQualityId;
}

/** The relay role held in someone else's tree: the forwarding stream and its pipe. */
interface RelayLeg {
  stream: MediaStream;
  track: MediaStreamTrack | null;
  /** The forwarding stream was announced to the server for this tree. */
  reported: boolean;
  controller: ScreenRelayController | null;
}

/**
 * One tool's shared state, as this client last heard it (protocol.ts,
 * `tool-state`). The state itself is opaque here — only the tool that
 * owns it knows what is inside, and only the tool checks it.
 */
export interface ToolRoomState {
  state: unknown;
  /**
   * Local clock (ms) when the state was SET, not when it arrived: the
   * server sends its age, so the time the message spent in flight is
   * already paid. A tool that keeps time counts from here.
   */
  at: number;
  /** The peer that set it. */
  by: string;
  /**
   * This client caused the change. Its own copy is already there, so a
   * tool leaves it alone rather than correcting a round trip late.
   */
  mine: boolean;
}

export interface ChatMessage {
  from: PeerInfo;
  text: string;
  ts: number;
  /** The message this one replies to, as the sender excerpted it. */
  quote?: ChatQuote;
  /** Sealed for a key this client does not hold: render a placeholder. */
  unreadable?: boolean;
}

export type RoomStatus =
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'ended'; reason: 'closed' | 'left' | 'room_not_found' | 'room_full' | 'invalid_name' };

const MAX_CHAT_MESSAGES = 200;
/** Nobody refused this tree — shared, so the common case allocates nothing. */
const EMPTY_REFUSALS: ReadonlySet<string> = new Set<string>();
/** Mirrors the server's ROOM_LIMITS.heartbeatIntervalMs. */
const HEARTBEAT_MS = 10_000;
/** Mirrors ROOM_LIMITS.peerTimeoutMs: no pong within this and the session is over. */
const PONG_TIMEOUT_MS = 35_000;
const STATS_INTERVAL_MS = 2_000;
/**
 * What the voice is assumed to ask of the uplink (bps) when the adaptive
 * ladders gate a step-up on estimated headroom: audio rides uncapped in
 * practice, so the gate books a round number for it instead of zero.
 */
const AUDIO_ASK_BITRATE = 100_000;
/** How long the "camera denied" feedback stays up before clearing itself. */
const CAM_DENIED_MS = 4_000;
/** Same, for a tool the room had no room for. */
const TOOL_DENIED_MS = 4_000;
const QUALITY_STORAGE_KEY = 'freecord:screen-quality';
/** Pre-rename storage: key from the guest-rooms era, values in Portuguese. */
const LEGACY_QUALITY_STORAGE_KEY = 'guest-rooms:screen-quality';
const LEGACY_QUALITY_IDS: Record<string, ScreenQualityId> = {
  nitida: 'sharp',
  equilibrada: 'balanced',
  fluida: 'smooth',
};

function loadQuality(): ScreenQualityId {
  try {
    const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (saved === 'sharp' || saved === 'balanced' || saved === 'smooth') {
      return saved;
    }
    const legacy = localStorage.getItem(LEGACY_QUALITY_STORAGE_KEY);
    if (legacy && LEGACY_QUALITY_IDS[legacy]) {
      return LEGACY_QUALITY_IDS[legacy];
    }
    return DEFAULT_SCREEN_QUALITY;
  } catch {
    return DEFAULT_SCREEN_QUALITY;
  }
}

export function useRoomSession(options: JoinOptions) {
  const [status, setStatus] = useState<RoomStatus>({ kind: 'connecting' });
  /** Signaling dropped and is resuming — the media mesh keeps flowing meanwhile. */
  const [reconnecting, setReconnecting] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  /** Peer-to-peer file transfers, every direction, over the mesh's data channels. */
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  /**
   * A sealed message arrived and this client has no key: the room is
   * provably encrypted, so sending plaintext into it would be a silent
   * downgrade — the UI disables the composer, sendChat refuses anyway.
   */
  const [chatLocked, setChatLocked] = useState(false);
  /** Screens being shared, in start order (at most MAX_SCREENS). */
  const [screens, setScreens] = useState<ScreenShare[]>([]);
  const [localMedia, setLocalMedia] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  /** The echo guard's readings while WE are sharing sound; null otherwise. */
  const [screenAudioGuard, setScreenAudioGuard] = useState<EchoGuardStats | null>(null);
  const [micOn, setMicOn] = useState(options.micEnabled);
  // Optimistic-off: the camera starts dark and lights up only on the
  // server's grant (camera-started) — never before.
  const [camOn, setCamOn] = useState(false);
  /** Peers holding a camera slot right now (self included when granted). */
  const [cameras, setCameras] = useState<Set<string>>(new Set());
  /** Peers with their speakers off — they are not hearing anyone. */
  const [deafened, setDeafened] = useState<Set<string>>(new Set());
  /** Who has their microphone off — the room's word (`peer-muted`), not the track's. */
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [speakerOn, setSpeakerOn] = useState(true);
  const speakerOnRef = useRef(true);
  /** Mirror of micOn for the welcome handler, which must not close over state. */
  const micOnRef = useRef(options.micEnabled);
  /** A camera-denied just landed: the UI shows why the toggle did nothing. */
  const [camDenied, setCamDenied] = useState(false);
  const [screenQuality, setScreenQualityState] = useState<ScreenQualityId>(loadQuality);
  /** User-tunable media prefs (mic profile, camera ceiling, screen audio). */
  const [mediaSettings, setMediaSettings] = useState<MediaSettings>(loadMediaSettings);
  /** What this person takes part in (participation.ts) — local, never on the wire. */
  const [participation, setParticipation] = useState<Participation>(loadParticipation);
  /** Per-machine device choice: which mic captures, where playback goes. */
  const [audioDevices, setAudioDevices] = useState<AudioDevicePrefs>(loadAudioDevicePrefs);
  const [peerLatency, setPeerLatency] = useState<Map<string, PeerLatency>>(new Map());
  const [signalRttMs, setSignalRttMs] = useState<number | null>(null);
  const [screenStats, setScreenStats] = useState<ScreenStats | null>(null);
  /** Who I receive each screen from in its tree (may be a relay, not the sharer), by sharer id. */
  const [screenSources, setScreenSources] = useState<
    Map<string, { id: string; streamId: string } | null>
  >(new Map());
  /** What each tool on the shelf has going, by tool id; empty when none. */
  const [tools, setTools] = useState<ReadonlyMap<string, ToolRoomState>>(new Map());
  /** The tool the room had no room for, until the shelf has shown it. */
  const [toolDenied, setToolDenied] = useState<string | null>(null);
  /** The screen the view has on stage — its stats and stall watch follow it. */
  const [watchedScreenId, setWatchedScreenId] = useState<string | null>(null);
  const watchScreen = useCallback((id: string | null) => setWatchedScreenId(id), []);
  /**
   * The screen whose quality is measured: what the view watches, else
   * someone else's before our own, the earliest started first.
   */
  const screen = useMemo(
    () =>
      screens.find((share) => share.id === watchedScreenId) ??
      screens.find((share) => share.id !== selfId) ??
      screens[0] ??
      null,
    [screens, selfId, watchedScreenId],
  );
  const screenSource = useMemo(
    () => (screen ? (screenSources.get(screen.id) ?? null) : null),
    [screen, screenSources],
  );
  /** Every stream id that carries a screen (originals and relays' forwards): never a camera tile. */
  const screenStreamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const share of screens) {
      ids.add(share.streamId);
    }
    for (const source of screenSources.values()) {
      if (source) {
        ids.add(source.streamId);
      }
    }
    return ids;
  }, [screens, screenSources]);
  const [meshVersion, bumpVersion] = useReducer((v: number) => v + 1, 0);

  const signalingRef = useRef<Signaling | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  /** One per mesh: a fresh seat gets fresh channels and a fresh ledger. */
  const transfersRef = useRef<FileTransfers | null>(null);
  /** Text over the mesh's `chat` channels; the server relays when a seat has none (chat-channel.ts). */
  const chatChannelsRef = useRef<ChatChannels | null>(null);
  /** Hysteresis between noisy getStats readings and rare tree reroutes. */
  const linkHealthRef = useRef(new LinkHealthTracker());
  const localMediaRef = useRef<MediaStream | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const pendingScreenRef = useRef<MediaStream | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);
  /**
   * The guard cleaning our own capture, with the RAW track it is fed by.
   * The raw track is not in the display stream any more — the clean one
   * took its place there — so nothing else would ever stop it, and a
   * capture left running is an operating system still saying we are
   * sharing after we stopped.
   */
  const screenGuardRef = useRef<{ guard: GuardedCapture; raw: MediaStreamTrack } | null>(null);
  const qualityRef = useRef<ScreenQualityId>(screenQuality);
  /** Mirror for callbacks (share start) that must not close over state. */
  const mediaSettingsRef = useRef<MediaSettings>(mediaSettings);
  const participationRef = useRef<Participation>(participation);
  /** Peers who refused a screen, by the sharer whose tree it is. */
  const refusedRef = useRef<Map<string, Set<string>>>(new Map());
  /** What this client last told each tree's source, so it says it once. */
  const toldSourceRef = useRef<Map<string, { to: string; on: boolean }>>(new Map());
  /** Mirror of audioDevices for the same reason. */
  const audioDevicesRef = useRef<AudioDevicePrefs>(audioDevices);
  /** Serializes live mic swaps so two quick picks cannot interleave. */
  const micSwapRef = useRef<Promise<void>>(Promise.resolve());
  const viewerCountRef = useRef(0);
  /** The user's intent: camera wanted on. Survives the request round-trip. */
  const camWantedRef = useRef(options.camEnabled);
  /** A camera-request is in flight: swallow double-clicks until it answers. */
  const camPendingRef = useRef(false);
  const camDeniedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolDeniedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The door has opened once. A later welcome is a reconnection, not an arrival. */
  const arrivedRef = useRef(false);
  const lastPongRef = useRef(0);
  /** Our route in each screen's forwarding tree, by sharer id (our own share included). */
  const routesRef = useRef(new Map<string, ScreenRoute>());
  /** The relay roles we hold in other people's trees, by sharer id. */
  const relaysRef = useRef(new Map<string, RelayLeg>());
  /** Viewer-side stall watch: flat framesDecoded escalates (stall-watch.ts). */
  const screenStallRef = useRef<StallState>(initialStallState());
  /** Per-peer voice watch: a flat inbound packet counter restarts that leg's ICE. */
  const audioStallRef = useRef(new Map<string, StallState>());
  /**
   * Per-tree watch over a screen that never arrived at all, by sharer id.
   * Not scoped to the stage: the other two shares, and every share while
   * a tool owns the stage, are received all the same — and a relay whose
   * upstream died takes its children down with it whether or not it is
   * looking at that screen itself.
   */
  const missingStallRef = useRef(new Map<string, StallState>());
  /** AV1-first when hardware-encodable at the current preset; null = browser default. */
  const screenCodecsRef = useRef<RTCRtpCodec[] | null>(null);
  /** Imported once per session from options.roomKey; survives resumes. */
  const chatKeyRef = useRef<CryptoKey | null>(null);
  /** Serializes async decryption so messages land in arrival order. */
  const chatQueueRef = useRef<Promise<void>>(Promise.resolve());
  /** Mirror of chatLocked for callbacks that must not close over state. */
  const chatLockedRef = useRef(false);
  /** Mirror of the roster for the same reason: the chat's "everyone reachable?" check. */
  const peersRef = useRef<PeerInfo[]>([]);
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  /**
   * Appends one line to the chat. `plain` is the decoded body, or null for
   * a sealed line this client cannot read. `ts` is always this client's
   * clock at arrival (or at send, for its own line): the timeline sorts by
   * it, and lines that came over the mesh, lines the server relayed and
   * file transfers must share one clock or a skewed peer's reply would
   * sort ahead of the line it answers.
   */
  const appendChat = useCallback((from: PeerInfo, ts: number, plain: string | null) => {
    const body = plain === null ? null : decodeChatBody(plain);
    const entry: ChatMessage = !body
      ? { from, ts, text: '', unreadable: true }
      : body.quote
        ? { from, ts, text: body.text, quote: body.quote }
        : { from, ts, text: body.text };
    setChat((current) => [...current.slice(-MAX_CHAT_MESSAGES + 1), entry]);
  }, []);
  /**
   * Congestion ladders (adaptive-policy.ts): level 0 = the preset's full
   * cap. Applied inside the encoding funnels (roomCameraEncoding /
   * screenEncoding), so every existing re-application — join/leave,
   * settings change, mic swap via replaceLocalTrack — carries the current
   * factor for free.
   */
  const camLadderRef = useRef(initialAdaptiveState());
  const screenLadderRef = useRef(initialAdaptiveState());

  const dropLocalScreen = useCallback(() => {
    for (const stream of [pendingScreenRef.current, localScreenRef.current]) {
      if (stream) {
        for (const track of stream.getTracks()) {
          meshRef.current?.removeLocalTrack(track);
          track.stop();
        }
      }
    }
    // The clean track was stopped with the stream above; the raw capture
    // behind it, and the graph between them, are ours to close.
    const guarded = screenGuardRef.current;
    if (guarded) {
      screenGuardRef.current = null;
      guarded.guard.stop();
      guarded.raw.stop();
    }
    pendingScreenRef.current = null;
    localScreenRef.current = null;
    // The next share re-learns the link instead of inheriting this one's verdict.
    screenLadderRef.current = initialAdaptiveState();
    setLocalScreen(null);
    setScreenStats(null);
    setScreenAudioGuard(null);
  }, []);

  /**
   * Screen send cap: the preset split across the number of CHILDREN in
   * the tree — at most SCREEN_FANOUT, regardless of room size. Before the
   * route arrives, the conservative split uses the peer count. The
   * congestion ladder then takes its cut: the split is an assumption
   * about the uplink, the ladder is what the uplink actually said.
   */
  const screenEncoding = useCallback((): TrackEncoding => {
    const preset = presetById(qualityRef.current);
    const own = selfIdRef.current ? routesRef.current.get(selfIdRef.current) : undefined;
    const receivers = own?.children.length ?? viewerCountRef.current;
    return adaptedEncoding(
      {
        maxBitrate: bitrateFor(preset, receivers),
        maxFramerate: preset.frameRate,
        degradationPreference: preset.degradationPreference,
        // Below audio, above camera: congestion sacrifices the camera first.
        priority: 'medium',
      },
      screenLadderRef.current,
      { floor: SCREEN_MIN_BITRATE },
    );
  }, []);

  /** A relay's forwarding cap: the sharer's preset, split across its children. */
  const relayEncoding = useCallback(
    (route: { children: string[]; quality: ScreenQualityId }): TrackEncoding => {
      const preset = presetById(route.quality);
      return {
        maxBitrate: bitrateFor(preset, route.children.length),
        maxFramerate: preset.frameRate,
        degradationPreference: preset.degradationPreference,
        priority: 'medium',
      };
    },
    [],
  );

  /**
   * Undoes a relay role (one tree, or every tree when no sharer is named):
   * stops forwarding without touching the remote track.
   */
  const teardownRelay = useCallback((sharerId?: string) => {
    const legs = relaysRef.current;
    for (const [id, leg] of [...legs]) {
      if (sharerId !== undefined && id !== sharerId) {
        continue;
      }
      leg.controller?.close();
      if (leg.track) {
        meshRef.current?.removeLocalTrack(leg.track);
        leg.stream.removeTrack(leg.track);
      }
      legs.delete(id);
    }
  }, []);

  /**
   * Reconciles this peer's role in every screen's forwarding tree.
   *
   * Called when a route changes and when the mesh notifies (a parent's
   * track may arrive after the route). Our own share: targets and cap
   * from our route in our own tree. Every other tree where we have
   * children: announce a forwarding stream once and wire the track
   * received from that tree's parent to those children; a tree where we
   * are a leaf again, or that ended, has its relay leg undone.
   */
  const syncScreenTree = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const selfId = selfIdRef.current;
    const routes = routesRef.current;

    const refusedIn = (of: string): ReadonlySet<string> =>
      refusedRef.current.get(of) ?? EMPTY_REFUSALS;

    const localTrack = localScreenRef.current?.getVideoTracks()[0];
    if (localTrack) {
      const own = selfId ? routes.get(selfId) : undefined;
      // Somebody who refused this screen is not a target: the capture
      // keeps running for everyone else, and for whoever joins next.
      mesh.setTrackTargets(
        localTrack,
        selfId ? sendingTargets(own?.children ?? [], refusedIn(selfId)) : [],
      );
      mesh.setTrackEncoding(localTrack, screenEncoding());
    }

    for (const id of [...relaysRef.current.keys()]) {
      const route = routes.get(id);
      if (!route || sendingTargets(route.children, refusedIn(id)).length === 0) {
        teardownRelay(id);
      }
    }
    for (const [of, route] of routes) {
      if (of === selfId) {
        continue;
      }
      const targets = sendingTargets(route.children, refusedIn(of));
      // Tell this tree's source whether to keep sending. Only a peer with
      // nobody left waiting on it may refuse (participation.ts): while
      // somebody downstream still wants the screen, this peer carries it
      // for them — and still does not draw it.
      const refuse = mayRefuse(participationRef.current, targets);
      const told = toldSourceRef.current.get(of);
      if (route.source && (told?.to !== route.source.id || told.on !== refuse)) {
        toldSourceRef.current.set(of, { to: route.source.id, on: refuse });
        signalingRef.current?.send({
          t: 'signal',
          to: route.source.id,
          data: makeScreenRefusal(of, refuse),
        });
      }
      if (targets.length === 0) {
        continue;
      }
      let leg = relaysRef.current.get(of);
      if (!leg) {
        leg = { stream: new MediaStream(), track: null, reported: false, controller: null };
        relaysRef.current.set(of, leg);
      }
      if (!leg.reported) {
        leg.reported = true;
        signalingRef.current?.send({ t: 'screen-relay', of, streamId: leg.stream.id });
      }

      const parentTrack = route.source
        ? (mesh
            .getPeerStreams(route.source.id)
            .find((s) => s.id === route.source!.streamId)
            ?.getVideoTracks()[0] ?? null)
        : null;

      if (leg.track && leg.track !== parentTrack) {
        // Parent changed (a relay dropped, the tree moved): let go of the old track.
        mesh.removeLocalTrack(leg.track);
        leg.stream.removeTrack(leg.track);
        leg.track = null;
      }
      if (parentTrack && route.source && leg.track !== parentTrack) {
        leg.stream.addTrack(parentTrack);
        leg.track = parentTrack;
        if (!leg.controller && ScreenRelayController.supported()) {
          leg.controller = new ScreenRelayController(mesh);
        }
        // Passthrough wants the children on the upstream's codec, and the
        // preference must land in the same tick as addTrack (see addSender).
        // Without a controller, a relay re-encodes and the codec gate
        // (hardware AV1 or default) is its own.
        const pinned = leg.controller?.childCodecPreferences(
          route.source.id,
          parentTrack,
          screenCodecsRef.current !== null,
        );
        mesh.addLocalTrack(
          parentTrack,
          leg.stream,
          relayEncoding(route),
          targets,
          pinned ?? screenCodecsRef.current,
        );
        leg.controller?.sync(route.source.id, parentTrack, targets);
      } else if (parentTrack && route.source) {
        mesh.setTrackTargets(parentTrack, targets);
        mesh.setTrackEncoding(parentTrack, relayEncoding(route));
        leg.controller?.sync(route.source.id, parentTrack, targets);
      }
    }
  }, [screenEncoding, relayEncoding, teardownRelay]);

  /**
   * Room policy composed with the user's ceiling (caps only lower, never
   * raise), then the congestion ladder's cut. At half factor and below the
   * encode itself is shrunk — a starved encoder is also a hot one, and
   * half resolution looks better than full resolution at eighth bitrate.
   */
  const roomCameraEncoding = useCallback((peerCount: number): TrackEncoding => {
    return adaptedEncoding(
      composeCameraEncoding(
        cameraEncoding(peerCount),
        cameraUserCaps(cameraPresetById(mediaSettingsRef.current.camera)),
      ),
      camLadderRef.current,
      { floor: CAMERA_MIN_BITRATE, scaleDownAt: 0.5 },
    );
  }, []);

  /** Grant in hand: acquire the camera now and put it on the mesh. */
  const acquireCamera = useCallback(async () => {
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: cameraConstraints(cameraPresetById(mediaSettingsRef.current.camera)),
      });
      const track = cam.getVideoTracks()[0];
      if (!track) {
        return;
      }
      track.contentHint = 'motion';
      const media = localMediaRef.current;
      const target = media ?? new MediaStream();
      target.addTrack(track);
      if (!media) {
        localMediaRef.current = target;
      }
      setLocalMedia(target);
      meshRef.current?.addLocalTrack(track, target, roomCameraEncoding(viewerCountRef.current));
      setCamOn(true);
      bumpVersion();
    } catch {
      // permission denied: hand the granted slot back
      camWantedRef.current = false;
      signalingRef.current?.send({ t: 'camera-stop' });
    }
  }, [roomCameraEncoding]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      // Key first: chat can arrive right behind the welcome.
      chatKeyRef.current = options.roomKey ? await importRoomKey(options.roomKey) : null;
      // Profile and device from the saved settings; every constraint is
      // soft (ideal), so a missing device degrades instead of blocking.
      const settings = mediaSettingsRef.current;
      const audioConstraints: MediaTrackConstraints = {
        ...micConstraints(settings.mic),
        ...micDeviceConstraint(audioDevicesRef.current.micId, false),
      };
      let media: MediaStream | null = null;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: options.camEnabled
            ? cameraConstraints(cameraPresetById(settings.camera))
            : false,
        });
      } catch {
        try {
          media = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch {
          media = null; // join as listener/viewer only
        }
      }
      if (cancelled) {
        media?.getTracks().forEach((track) => track.stop());
        return;
      }
      await Promise.all(
        (media?.getAudioTracks() ?? []).map((track) =>
          applyBestMicProcessing(track, settings.mic).catch(() => {
            // The getUserMedia processing stays active as the safe fallback.
          }),
        ),
      );
      if (cancelled) {
        media?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (media && !options.micEnabled) {
        media.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      media?.getAudioTracks().forEach((track) => {
        track.contentHint = micContentHint(settings.mic);
      });
      // The camera slot belongs to the server: the track is acquired now
      // (one permission prompt) but stays dark until camera-started grants.
      media?.getVideoTracks().forEach((track) => {
        track.contentHint = 'motion';
        track.enabled = false;
      });
      localMediaRef.current = media;
      setLocalMedia(media);

      const signaling = new Signaling(options.slug, options.name, {
        onMessage: handleMessage,
        onClose: () => setStatus({ kind: 'ended', reason: 'closed' }),
        onReconnecting: () => setReconnecting(true),
      });
      signalingRef.current = signaling;
      void screenCodecPreferences(presetById(qualityRef.current)).then((codecs) => {
        screenCodecsRef.current = codecs;
      });
    }

    /**
     * One door for text from either path — the server relay or a peer's
     * chat channel. Opening the envelope is async; the queue keeps arrival
     * order.
     */
    function deliverChat(from: PeerInfo, wire: string): void {
      const ts = Date.now();
      chatQueueRef.current = chatQueueRef.current.then(async () => {
        const opened = await openChat(chatKeyRef.current, wire);
        if (cancelled) {
          return;
        }
        if (opened.unreadable && !chatKeyRef.current) {
          chatLockedRef.current = true;
          setChatLocked(true);
        }
        appendChat(from, ts, opened.unreadable ? null : opened.text);
      });
    }

    function handleMessage(message: ServerMessage): void {
      switch (message.t) {
        case 'welcome': {
          setReconnecting(false);
          signalingRef.current?.setResumeToken(message.resumeToken);
          const resumed = meshRef.current !== null && selfIdRef.current === message.selfId;
          if (resumed) {
            // A quality transition may have happened while signaling was
            // offline (non-signal messages are deliberately not queued).
            // Reasserting every tracked verdict is idempotent server-side.
            for (const update of linkHealthRef.current.snapshot()) {
              signalingRef.current?.send({ t: 'peer-link', ...update });
            }
          } else {
            linkHealthRef.current = new LinkHealthTracker();
          }
          selfIdRef.current = message.selfId;
          setSelfId(message.selfId);
          setPeers(message.peers);
          const live = message.screens.filter((share) => {
            if (share.id !== message.selfId || localScreenRef.current || pendingScreenRef.current) {
              return true;
            }
            // The server still lists a screen of ours that this page has
            // no capture to back (the seat came back without the stream).
            // Release it, or the room would be short a slot until we left:
            // a share belongs to whoever is actually sending.
            signalingRef.current?.send({ t: 'screen-stop' });
            return false;
          });
          setScreens(live);
          // Trees that ended while we were away: forget their routes and
          // undo any relay leg we held in them.
          const liveIds = new Set(live.map((share) => share.id));
          for (const id of [...routesRef.current.keys()]) {
            if (!liveIds.has(id)) {
              routesRef.current.delete(id);
            }
          }
          setScreenSources((current) => {
            const next = new Map<string, { id: string; streamId: string } | null>();
            for (const [id, source] of current) {
              if (liveIds.has(id)) {
                next.set(id, source);
              }
            }
            return next;
          });
          for (const id of [...relaysRef.current.keys()]) {
            if (!liveIds.has(id)) {
              teardownRelay(id);
            }
          }
          {
            // Whatever the room already had on: each state's age is
            // subtracted so a tool counts from when it was SET, not from
            // when this seat heard about it.
            const now = Date.now();
            setTools(
              new Map(
                message.tools.map((entry) => [
                  entry.tool,
                  { state: entry.state, at: now - entry.age, by: entry.by, mine: false },
                ]),
              ),
            );
          }
          const cameraRoster = new Set(message.cameras);
          setCameras(cameraRoster);
          setDeafened(new Set(message.deafened));
          setMuted(new Set(message.muted));
          if (!speakerOnRef.current) {
            // Presence is not kept for us across a fresh seat: say it again.
            signalingRef.current?.send({ t: 'deafen', on: true });
          }
          if (!micOnRef.current) {
            signalingRef.current?.send({ t: 'mute', on: true });
          }
          if (resumed) {
            // Same seat, mesh intact: reconcile who came and went during
            // the outage. We initiate toward newcomers; perfect
            // negotiation absorbs the glare if they offered first.
            const mesh = meshRef.current!;
            for (const peer of message.peers) {
              mesh.ensurePeer(peer.id);
            }
            for (const id of mesh.peerIds()) {
              if (!message.peers.some((peer) => peer.id === id)) {
                mesh.removePeer(id);
              }
            }
            // Whatever a peer was negotiating with us while our signaling
            // was down is presumed lost: open negotiations are rolled back
            // and reoffered, downed ICE paths restarted. Before the held
            // signals arrive, which the transport flushes right after this.
            mesh.reconcile();
            if (!liveIds.has(message.selfId)) {
              // Our share ended while we were away (it hit the lock's
              // grace): the missed screen-stopped is applied here.
              dropLocalScreen();
            }
            // Our tree role arrives in the screen-route the server re-emits.
          } else {
            // A fresh seat means a fresh mesh: any relay wiring (forward
            // stream, passthrough pipe) belonged to the old one — and so
            // did the congestion ladders' verdicts about its links.
            teardownRelay();
            routesRef.current.clear();
            meshRef.current?.close();
            camLadderRef.current = initialAdaptiveState();
            screenLadderRef.current = initialAdaptiveState();
            const mesh = new Mesh(
              message.selfId,
              (to, data) => signalingRef.current?.send({ t: 'signal', to, data }),
              message.ice,
              // Lifts what peers let us SEND (Opus stereo + hi-fi ceiling);
              // spending it stays a sender-side choice (mic profile).
              allowHiFiOpus,
            );
            mesh.subscribe(bumpVersion);
            transfersRef.current?.close();
            const fileTransfers = new FileTransfers();
            fileTransfers.subscribe(() => setTransfers(fileTransfers.list()));
            mesh.onDataChannel = (peerId, channel) => fileTransfers.attach(peerId, channel);
            transfersRef.current = fileTransfers;
            setTransfers([]);
            chatChannelsRef.current?.close();
            const chatChannels = new ChatChannels();
            chatChannels.onMessage = ({ peerId, name, text }) => {
              // The roster's name wins; the frame's covers a channel that
              // came up ahead of its peer-joined.
              const known = peersRef.current.find((peer) => peer.id === peerId);
              deliverChat({ id: peerId, name: known?.name ?? name }, text);
            };
            mesh.onChatChannel = (peerId, channel) => chatChannels.attach(peerId, channel);
            chatChannelsRef.current = chatChannels;
            meshRef.current = mesh;
            const media = localMediaRef.current;
            if (media) {
              for (const track of media.getTracks()) {
                // Video is the camera: the adaptive split composed with the
                // user's ceiling. Audio gets the profile's Opus cap; its
                // priority stays pinned high by the mesh.
                mesh.addLocalTrack(
                  track,
                  media,
                  track.kind === 'video'
                    ? roomCameraEncoding(message.peers.length)
                    : micEncoding(mediaSettingsRef.current.mic),
                );
              }
            }
            // The newcomer initiates the connection with everyone already in.
            for (const peer of message.peers) {
              mesh.ensurePeer(peer.id);
            }
            const sharing = localScreenRef.current;
            if (sharing) {
              // A capture that outlived its seat: the lock belonged to
              // the old one. Ask again, and let the grant put the tracks
              // on the fresh mesh through the same door a first share
              // uses — a denial (the slot went to someone else while we
              // were away) drops the capture, as it always does.
              localScreenRef.current = null;
              setLocalScreen(null);
              pendingScreenRef.current = sharing;
              signalingRef.current?.send({
                t: 'screen-request',
                streamId: sharing.id,
                quality: qualityRef.current,
              });
            }
          }
          // Fresh join, or a resume whose slot was released on disconnect
          // (the server gives cameras no grace): (re-)request. A fresh
          // track stays dark until the grant; a resumed one keeps flowing
          // and only goes dark if the re-request is denied.
          if (
            camWantedRef.current &&
            localMediaRef.current?.getVideoTracks().length &&
            !cameraRoster.has(message.selfId) &&
            !camPendingRef.current
          ) {
            camPendingRef.current = true;
            signalingRef.current?.send({ t: 'camera-request' });
          }
          lastPongRef.current = Date.now();
          if (arrivedRef.current) {
            // A resume: the room was already on screen and never left it.
            setStatus({ kind: 'connected' });
          } else {
            /*
             * The last leg of the way in. The waiting screen is holding the
             * mark, the room's name and the guest's own face exactly where
             * they landed from the doorstep; this is the move that carries
             * them the rest of the way — the face into its own tile, the
             * name into the room's title. See web/src/hero.css.
             */
            arrivedRef.current = true;
            heroTransition(() => setStatus({ kind: 'connected' }));
          }
          return;
        }
        case 'peer-joined': {
          // Presence cue. Not on a diff of the roster — a resume replays
          // the whole roster in `welcome` and must stay silent — but on
          // this event actually changing it: a seat announced twice is one
          // arrival, and only the first is worth a sound.
          const known = peersRef.current.some((p) => p.id === message.peer.id);
          // The newly arrived peer initiates; here we only record the name.
          setPeers((current) => [...current.filter((p) => p.id !== message.peer.id), message.peer]);
          if (!known) {
            playJoinChime();
          }
          return;
        }
        case 'peer-left': {
          meshRef.current?.removePeer(message.id);
          transfersRef.current?.detach(message.id);
          chatChannelsRef.current?.detach(message.id);
          // Only a seat we still had rings: a server that says the same
          // goodbye twice — a dead socket swept again — is one departure,
          // not a chime every sweep for the rest of the call.
          if (peersRef.current.some((p) => p.id === message.id)) {
            peersRef.current = peersRef.current.filter((p) => p.id !== message.id);
            playLeaveChime();
          }
          setPeers((current) => current.filter((p) => p.id !== message.id));
          // The seat took its camera slot along.
          setCameras((current) => {
            if (!current.has(message.id)) {
              return current;
            }
            const next = new Set(current);
            next.delete(message.id);
            return next;
          });
          setDeafened((current) => {
            if (!current.has(message.id)) {
              return current;
            }
            const next = new Set(current);
            next.delete(message.id);
            return next;
          });
          setMuted((current) => {
            if (!current.has(message.id)) {
              return current;
            }
            const next = new Set(current);
            next.delete(message.id);
            return next;
          });
          return;
        }
        case 'signal': {
          // Relay-health notes ride the same opaque envelope as SDP/ICE
          // (the server never inspects `data`): peel ours off, let the
          // mesh no-op anything a newer client may add.
          const note = extractRelayNote(message.data);
          if (note?.kind === 'stall') {
            for (const leg of relaysRef.current.values()) {
              leg.controller?.handleStallNote(message.from);
            }
            return;
          }
          if (note?.kind === 'missing') {
            // Somebody downstream has nothing at all from us for that
            // tree. Whatever they refused earlier is over — they are
            // asking — and reconciling the tree re-adds a sender that
            // went missing. If we have no upstream either, our own
            // watch is already asking the same of our source.
            refusedRef.current.get(note.of)?.delete(message.from);
            syncScreenTree();
            return;
          }
          const refusal = extractScreenRefusal(message.data);
          if (refusal) {
            // Somebody below stepped out of (or back into) a screen. It
            // costs them nothing to say so twice, so this is idempotent.
            const refused = refusedRef.current.get(refusal.of) ?? new Set<string>();
            if (refusal.on) {
              refused.add(message.from);
            } else {
              refused.delete(message.from);
            }
            refusedRef.current.set(refusal.of, refused);
            syncScreenTree();
            return;
          }
          void meshRef.current?.handleSignal(message.from, message.data);
          return;
        }
        case 'chat':
          deliverChat(message.from, message.text);
          return;
        case 'screen-started': {
          setScreens((current) => {
            const share = { id: message.id, streamId: message.streamId };
            return current.some((s) => s.id === share.id)
              ? current.map((s) => (s.id === share.id ? share : s))
              : [...current, share];
          });
          if (message.id === selfIdRef.current) {
            const stream = pendingScreenRef.current;
            if (stream) {
              pendingScreenRef.current = null;
              localScreenRef.current = stream;
              setLocalScreen(stream);
              for (const track of stream.getVideoTracks()) {
                // Targets start empty: the screen-route right behind says
                // who to send to — the children in the tree, never the
                // whole room.
                meshRef.current?.addLocalTrack(
                  track,
                  stream,
                  screenEncoding(),
                  [],
                  screenCodecsRef.current,
                );
              }
              for (const track of stream.getAudioTracks()) {
                // Not a voice: whatever is on that screen is a game, a
                // film or music, and the browser's default for a mono
                // microphone would encode all three as speech at ~32 kbps.
                track.contentHint = SCREEN_AUDIO_CONTENT_HINT;
                // System audio goes out like the mic — straight to every
                // peer, never through the tree: ~128 kbps × 7 is nothing
                // next to one video hop, and it skips the relays' latency.
                // Riding the display stream tags it: viewers key on the
                // announced streamId to exclude it from camera tiles and
                // play it beside the (muted) stage video.
                meshRef.current?.addLocalTrack(track, stream, screenAudioEncoding());
              }
              syncScreenTree();
            }
          }
          return;
        }
        case 'screen-route':
          routesRef.current.set(message.of, {
            children: message.children,
            source: message.source,
            quality: message.quality,
          });
          setScreenSources((current) => new Map(current).set(message.of, message.source));
          syncScreenTree();
          return;
        case 'screen-stopped':
          setScreens((current) => current.filter((share) => share.id !== message.id));
          setScreenSources((current) => {
            if (!current.has(message.id)) {
              return current;
            }
            const next = new Map(current);
            next.delete(message.id);
            return next;
          });
          routesRef.current.delete(message.id);
          refusedRef.current.delete(message.id);
          toldSourceRef.current.delete(message.id);
          teardownRelay(message.id);
          if (message.id === selfIdRef.current) {
            dropLocalScreen();
          }
          return;
        case 'screen-denied':
          dropLocalScreen();
          return;
        case 'camera-started': {
          setCameras((current) => {
            const next = new Set(current);
            next.add(message.id);
            return next;
          });
          if (message.id === selfIdRef.current) {
            // Our grant: only now does the camera light up.
            camPendingRef.current = false;
            const track = localMediaRef.current?.getVideoTracks()[0];
            if (track) {
              track.enabled = true;
              setCamOn(true);
            } else if (camWantedRef.current) {
              void acquireCamera();
            }
          }
          return;
        }
        case 'camera-stopped':
          setCameras((current) => {
            const next = new Set(current);
            next.delete(message.id);
            return next;
          });
          return;
        case 'peer-muted':
          setMuted((current) => {
            const next = new Set(current);
            if (message.on) {
              next.add(message.id);
            } else {
              next.delete(message.id);
            }
            return next;
          });
          return;
        case 'peer-deafened':
          setDeafened((current) => {
            const next = new Set(current);
            if (message.on) {
              next.add(message.id);
            } else {
              next.delete(message.id);
            }
            return next;
          });
          return;
        case 'camera-denied': {
          camPendingRef.current = false;
          camWantedRef.current = false;
          // A resume's re-request refused: the slot went to someone else
          // while we were away — the camera goes dark now (a fresh
          // request never lit it in the first place).
          const track = localMediaRef.current?.getVideoTracks()[0];
          if (track?.enabled) {
            track.enabled = false;
          }
          setCamOn(false);
          setCamDenied(true);
          if (camDeniedTimerRef.current) {
            clearTimeout(camDeniedTimerRef.current);
          }
          camDeniedTimerRef.current = setTimeout(() => setCamDenied(false), CAM_DENIED_MS);
          return;
        }
        case 'tool-state': {
          const at = Date.now() - message.age;
          setTools((current) => {
            const next = new Map(current);
            if (message.state === null) {
              next.delete(message.tool);
            } else {
              next.set(message.tool, {
                state: message.state,
                at,
                by: message.by,
                mine: message.by === selfIdRef.current,
              });
            }
            return next;
          });
          return;
        }
        case 'tool-denied':
          // The room is carrying as many tools as it may. Nothing changed
          // for anybody, and the shelf says so where the person is looking.
          setToolDenied(message.tool);
          if (toolDeniedTimerRef.current) {
            clearTimeout(toolDeniedTimerRef.current);
          }
          toolDeniedTimerRef.current = setTimeout(() => setToolDenied(null), TOOL_DENIED_MS);
          return;
        case 'pong':
          lastPongRef.current = Date.now();
          setSignalRttMs(Math.max(0, Math.round(Date.now() - message.ts)));
          return;
        case 'error':
          if (message.code === 'resume_invalid') {
            // Never the end: a swept seat is answered by the transport
            // itself, which walks back through the door and comes in as
            // a newcomer (lib/signaling.ts). The room stays on screen,
            // and hears about it as the fresh welcome that follows.
            return;
          }
          // Gone, full, refused by name: the room is not letting us in.
          setStatus({ kind: 'ended', reason: message.code });
          return;
      }
    }

    void connect();

    return () => {
      cancelled = true;
      camPendingRef.current = false;
      if (camDeniedTimerRef.current) {
        clearTimeout(camDeniedTimerRef.current);
        camDeniedTimerRef.current = null;
      }
      if (toolDeniedTimerRef.current) {
        clearTimeout(toolDeniedTimerRef.current);
        toolDeniedTimerRef.current = null;
      }
      signalingRef.current?.close();
      signalingRef.current = null;
      meshRef.current?.close();
      meshRef.current = null;
      transfersRef.current?.close();
      transfersRef.current = null;
      chatChannelsRef.current?.close();
      chatChannelsRef.current = null;
      routesRef.current.clear();
      teardownRelay();
      dropLocalScreen();
      localMediaRef.current?.getTracks().forEach((track) => track.stop());
      localMediaRef.current = null;
    };
    // join options are stable for one room session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.slug, options.name]);

  /**
   * Heartbeat: measures signaling latency and proves to the server that
   * the connection is alive — without it the peer becomes a zombie and is
   * kicked.
   *
   * It also works in reverse: a vanished network delivers no close frame,
   * so the server's silence is what makes the client act — not by ending
   * the session, but by forcing the transport down and going through the
   * resume path. The session only ends when the resume gives up.
   */
  useEffect(() => {
    if (status.kind !== 'connected') {
      return;
    }
    lastPongRef.current = Date.now();
    const beat = () => {
      if (Date.now() - lastPongRef.current > PONG_TIMEOUT_MS) {
        lastPongRef.current = Date.now();
        signalingRef.current?.reconnectNow();
        return;
      }
      signalingRef.current?.send({ t: 'ping', ts: Date.now() });
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [status.kind]);

  // Closing the tab is a goodbye, not an accident: without this, the seat
  // (and a screen lock) would linger for the whole resume grace.
  useEffect(() => {
    const onPageHide = () => {
      signalingRef.current?.send({ t: 'leave' });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // Periodic getStats() sampling: per-peer latency and the screen's real
  // quality. A single sampler, so bitrate has a delta between readings.
  useEffect(() => {
    if (status.kind !== 'connected') {
      return;
    }
    const sampler = new StatsSampler();
    let stopped = false;
    // New sampler, possibly a new screen source: stale frame counts would
    // compare across different receivers.
    screenStallRef.current = initialStallState();
    audioStallRef.current = new Map();

    const sample = async () => {
      const mesh = meshRef.current;
      if (!mesh || stopped) {
        return;
      }
      const latencies = await sampler.peerLatencies(mesh);
      if (stopped) {
        return;
      }
      setPeerLatency(latencies);
      for (const update of linkHealthRef.current.sample(latencies)) {
        signalingRef.current?.send({ t: 'peer-link', ...update });
      }

      // Self-healing for a voice that went quiet on a path that still
      // claims to be connected (the NAT-rebind zombie the screen's watch
      // already hunts): one ICE restart per episode, per peer. ICE that
      // reports itself down is the mesh's own watchdog's job, not this one.
      const audioStalls = audioStallRef.current;
      for (const id of [...audioStalls.keys()]) {
        if (!latencies.has(id)) {
          audioStalls.delete(id);
        }
      }
      for (const [id, latency] of latencies) {
        let stall = audioStalls.get(id);
        if (!stall) {
          stall = initialStallState();
          audioStalls.set(id, stall);
        }
        const action =
          latency.state === 'connected'
            ? advanceAudioStall(stall, latency.audioPackets)
            : advanceAudioStall(stall, null);
        if (action === 'restart-ice') {
          mesh.restartIce(id);
        }
      }

      const sharing = localScreenRef.current?.getVideoTracks()[0] ?? null;
      // In the tree, the screen arrives from the PARENT (maybe a relay) —
      // the measured RTT is to it, not to the sharer.
      const watching =
        screenSource && screen && screen.id !== selfIdRef.current
          ? (mesh
              .getPeerStreams(screenSource.id)
              .find((stream) => stream.id === screenSource.streamId)
              ?.getVideoTracks()[0] ?? null)
          : null;
      const stats = sharing
        ? await sampler.sendingScreen(mesh, sharing)
        : watching && screenSource
          ? await sampler.receivingScreen(mesh, screenSource.id, watching)
          : null;
      if (stopped) {
        return;
      }
      if (stats?.direction === 'receiving') {
        stats.relayMode =
          (screen ? relaysRef.current.get(screen.id)?.controller?.modeSummary() : null) ?? null;
      }
      // Self-healing for a screen that froze while the tree says we should
      // be receiving (stall-watch.ts): first tell the parent — a relay
      // forwarding bytes it cannot see are dead demotes this child to
      // re-encode — and if the freeze survives that, restart ICE toward
      // the source: after hours of watching, the transport itself can go
      // zombie (NAT rebinding) without ever reporting 'failed'. A static
      // screen trips the note too (harmless outside passthrough); the
      // restart fires once per episode, so it never loops on one.
      const stall = screenStallRef.current;
      if (stats?.direction === 'receiving' && screenSource) {
        const action = advanceStall(stall, stats.framesDecoded, stats.kbps);
        if (action === 'notify-parent') {
          signalingRef.current?.send({
            t: 'signal',
            to: screenSource.id,
            data: makeRelayNote(),
          });
        } else if (action === 'restart-ice') {
          mesh.restartIce(screenSource.id);
        }
      } else {
        screenStallRef.current = initialStallState();
      }

      // The freeze above needs a track to measure. The other black
      // screen has none: the tree named a source and nothing ever came
      // from it — a sender the source dropped, an offer that died in a
      // hold queue, or, most often, a relay whose own upstream never
      // arrived. Nobody notices, because there is no receiver to read
      // and the source is happily sending to everybody else. So every
      // tree we are downstream in is watched, not just the one on
      // stage, and the ask walks up the branch on its own: it makes the
      // source reconcile its senders, and a source that is itself empty
      // is one rung behind us asking ITS source the same thing.
      const missing = missingStallRef.current;
      const expected = new Set<string>();
      for (const [of, route] of routesRef.current) {
        const source = route.source;
        if (!source || of === selfIdRef.current) {
          continue;
        }
        // We asked this source to stop (participation.ts): an empty
        // branch is what we wanted, not a fault to heal.
        const told = toldSourceRef.current.get(of);
        if (told?.to === source.id && told.on) {
          continue;
        }
        expected.add(of);
        // Audio-only is still missing: the sharer's display stream
        // carries system audio to everyone directly, so its id can be
        // here with no video on it at all.
        const present = mesh
          .getPeerStreams(source.id)
          .some((stream) => stream.id === source.streamId && stream.getVideoTracks().length > 0);
        let state = missing.get(of);
        if (!state) {
          state = initialStallState();
          missing.set(of, state);
        }
        const action = advanceMissing(state, present);
        if (action === 'ask-source') {
          signalingRef.current?.send({ t: 'signal', to: source.id, data: makeMissingNote(of) });
        } else if (action === 'restart-ice') {
          mesh.restartIce(source.id);
        }
      }
      for (const of of [...missing.keys()]) {
        if (!expected.has(of)) {
          missing.delete(of);
        }
      }

      setScreenStats(stats);

      // The adaptive tick: what the network said this sample — the
      // encoder's own limitation verdict, RTCP loss from the far ends,
      // the congestion controller's bandwidth estimate — moves the
      // ladders, and a moved ladder re-applies its cap through the same
      // composed encoding every other call site uses. Step-ups are gated
      // on estimated headroom over everything asked of the uplink right
      // now: per-transport asks, since the estimate is per-transport.
      const camTrack = localMediaRef.current?.getVideoTracks()[0] ?? null;
      const adaptCam = camTrack?.enabled ? camTrack : null;
      const askBitrate =
        (adaptCam ? roomCameraEncoding(viewerCountRef.current).maxBitrate : 0) +
        (sharing ? screenEncoding().maxBitrate : 0) +
        AUDIO_ASK_BITRATE;
      if (adaptCam) {
        const reading = congestionFromReports(await senderReports(mesh, adaptCam));
        if (stopped) {
          return;
        }
        const before = factorFor(camLadderRef.current);
        camLadderRef.current = advance(camLadderRef.current, reading, CAMERA_ADAPTIVE, askBitrate);
        if (factorFor(camLadderRef.current) !== before) {
          mesh.setTrackEncoding(adaptCam, roomCameraEncoding(viewerCountRef.current));
        }
      }
      if (sharing) {
        const reading = congestionFromReports(await senderReports(mesh, sharing));
        if (stopped) {
          return;
        }
        const before = factorFor(screenLadderRef.current);
        screenLadderRef.current = advance(
          screenLadderRef.current,
          reading,
          SCREEN_ADAPTIVE,
          askBitrate,
        );
        if (factorFor(screenLadderRef.current) !== before) {
          mesh.setTrackEncoding(sharing, screenEncoding());
        }
      }
    };

    void sample();
    const timer = setInterval(() => void sample(), STATS_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [status.kind, screen, screenSource, roomCameraEncoding, screenEncoding]);

  // The uplink split changes when someone joins or leaves (fallback until
  // the route arrives; with a route, the split is by children and the
  // server re-emits the route). The camera has no tree: its budget always
  // splits across the connected peers, so every join/leave recomputes it.
  useEffect(() => {
    viewerCountRef.current = peers.length;
    const track = localScreenRef.current?.getVideoTracks()[0];
    if (track) {
      meshRef.current?.setTrackEncoding(track, screenEncoding());
    }
    const camTrack = localMediaRef.current?.getVideoTracks()[0];
    if (camTrack) {
      meshRef.current?.setTrackEncoding(camTrack, roomCameraEncoding(peers.length));
    }
  }, [peers.length, screenEncoding, roomCameraEncoding]);

  // The parent's track may arrive AFTER the route (negotiation still in
  // flight): every mesh notification re-evaluates this peer's tree role.
  useEffect(() => {
    syncScreenTree();
  }, [meshVersion, syncScreenTree]);

  /** Preset change: applies immediately, without restarting the share. */
  const setScreenQuality = useCallback(
    (id: ScreenQualityId) => {
      qualityRef.current = id;
      setScreenQualityState(id);
      // Whether the NEW preset fits this link is an open question: the
      // ladder re-learns instead of carrying the old preset's verdict.
      screenLadderRef.current = initialAdaptiveState();
      // The hardware answer depends on the preset's load: re-ask for AV1.
      void screenCodecPreferences(presetById(id)).then((codecs) => {
        screenCodecsRef.current = codecs;
      });
      try {
        localStorage.setItem(QUALITY_STORAGE_KEY, id);
      } catch {
        // private browsing: the choice lasts only this session
      }
      const track = localScreenRef.current?.getVideoTracks()[0];
      if (track) {
        const preset = presetById(id);
        track.contentHint = preset.contentHint;
        void track.applyConstraints(screenConstraints(preset)).catch(() => {
          // the source rejects the requested resolution: the send cap still applies
        });
        meshRef.current?.setTrackEncoding(track, screenEncoding());
        // Re-announce the lock with the new quality: the tree's relays
        // receive the updated preset via screen-route.
        const streamId = localScreenRef.current?.id;
        if (streamId) {
          signalingRef.current?.send({ t: 'screen-request', streamId, quality: id });
        }
      }
    },
    [screenEncoding],
  );

  /**
   * Persists the choice and re-applies it to whatever is live right now:
   * the mic's processing chain, hint and Opus cap; the camera's capture
   * constraints and its composed send cap. Screen audio stays read at the
   * next share start. Never touches camera on/off — that is the server's
   * slot flow.
   */
  const updateMediaSettings = useCallback(
    (next: MediaSettings) => {
      mediaSettingsRef.current = next;
      setMediaSettings(next);
      saveMediaSettings(next);
      const mic = localMediaRef.current?.getAudioTracks()[0];
      if (mic) {
        mic.contentHint = micContentHint(next.mic);
        void applyBestMicProcessing(mic, next.mic).catch(() => {
          // a browser that cannot retoggle processing live: the cap still applies
        });
        meshRef.current?.setTrackEncoding(mic, micEncoding(next.mic));
      }
      const cam = localMediaRef.current?.getVideoTracks()[0];
      if (cam) {
        void cam.applyConstraints(cameraConstraints(cameraPresetById(next.camera))).catch(() => {
          // the device rejects the resolution: the send cap still applies
        });
        meshRef.current?.setTrackEncoding(cam, roomCameraEncoding(viewerCountRef.current));
      }
    },
    [roomCameraEncoding],
  );

  /**
   * Taking part, or not. Persists and then re-walks the screen trees: the
   * walk is what tells each tree's source to stop or to start again, so
   * turning screens back on needs no other bookkeeping. Tools need none of
   * this — refusing one is the view not building its stage.
   */
  const updateParticipation = useCallback(
    (next: Participation) => {
      participationRef.current = next;
      setParticipation(next);
      saveParticipation(next);
      syncScreenTree();
    },
    [syncScreenTree],
  );

  /**
   * Device change: persists, then swaps the live mic capture without
   * renegotiation (replaceTrack keeps the m-line; encodings and priority
   * ride along in the mesh's bookkeeping). The speaker side has no work
   * here — RoomView routes its sinks from the returned prefs. A failed
   * swap (device unplugged mid-pick) reverts the pref, so the menu shows
   * what is actually capturing.
   */
  const updateAudioDevices = useCallback((next: AudioDevicePrefs) => {
    const previous = audioDevicesRef.current;
    audioDevicesRef.current = next;
    setAudioDevices(next);
    saveAudioDevicePrefs(next);
    if (next.micId === previous.micId) {
      return;
    }
    micSwapRef.current = micSwapRef.current.then(async () => {
      // A newer pick may have superseded this one while queued.
      if (audioDevicesRef.current.micId !== next.micId) {
        return;
      }
      const media = localMediaRef.current;
      const oldTrack = media?.getAudioTracks()[0];
      if (!media || !oldTrack) {
        return; // no live mic (listener): the pref applies at the next acquisition
      }
      try {
        const settings = mediaSettingsRef.current;
        const capture = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...micConstraints(settings.mic),
            // Strict: the user just picked it — failing visibly beats silence.
            ...micDeviceConstraint(next.micId, true),
          },
        });
        const newTrack = capture.getAudioTracks()[0];
        if (!newTrack) {
          return;
        }
        await applyBestMicProcessing(newTrack, settings.mic).catch(() => {
          // The constraints used to acquire it already enabled the portable chain.
        });
        if (!meshRef.current) {
          // Left the room while the picker was answering.
          newTrack.stop();
          return;
        }
        newTrack.enabled = oldTrack.enabled; // the mute state survives the swap
        newTrack.contentHint = micContentHint(settings.mic);
        await meshRef.current.replaceLocalTrack(oldTrack, newTrack);
        media.removeTrack(oldTrack);
        media.addTrack(newTrack);
        oldTrack.stop();
        setLocalMedia(media);
        bumpVersion();
      } catch {
        // device gone or permission refused: the old mic keeps flowing
        audioDevicesRef.current = { ...audioDevicesRef.current, micId: previous.micId };
        setAudioDevices((current) => ({ ...current, micId: previous.micId }));
        saveAudioDevicePrefs(audioDevicesRef.current);
      }
    });
  }, []);

  /**
   * Routes one line. Over the mesh when every seat has an open chat channel
   * to us — then we append our own line, since no server echoes it back —
   * else through the server, which relays it to everyone including us, as
   * before the channel existed. One path per message, never both.
   */
  const dispatchChat = useCallback(
    (wire: string, body: string) => {
      const selfId = selfIdRef.current;
      const roster = peersRef.current.filter((peer) => peer.id !== selfId).map((peer) => peer.id);
      if (selfId && chatChannelsRef.current?.sendToAll(roster, options.name, wire)) {
        const from = { id: selfId, name: options.name };
        const ts = Date.now();
        chatQueueRef.current = chatQueueRef.current.then(() => appendChat(from, ts, body));
        return;
      }
      signalingRef.current?.send({ t: 'chat', text: wire });
    },
    [appendChat, options.name],
  );

  const sendChat = useCallback(
    (text: string, quote: ChatQuote | null = null) => {
      // The quote travels inside the body, so a sealed room seals it too.
      const body = encodeChatBody(text, quote);
      const key = chatKeyRef.current;
      if (!key) {
        if (chatLockedRef.current) {
          // The room is provably sealed and this client has no key:
          // refuse the silent plaintext downgrade.
          return;
        }
        // No key and no evidence of one (a pre-key room): plaintext, cut
        // the way the server would cut it so both paths show the same.
        const plain = normalizeChatText(body);
        if (plain) {
          dispatchChat(plain, plain);
        }
        return;
      }
      void sealChat(key, body).then((sealed) => dispatchChat(sealed, body));
    },
    [dispatchChat],
  );

  /**
   * Offers a file to everyone in the room, one transfer per peer. Returns
   * how many offers went out — zero means nobody is there to receive.
   */
  const sendFile = useCallback((file: File): number => {
    const ledger = transfersRef.current;
    const mesh = meshRef.current;
    if (!ledger || !mesh) {
      return 0;
    }
    let offered = 0;
    // One batch per file: the sender's chat shows one bubble for the room.
    const batch = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    for (const peerId of mesh.peerIds()) {
      if (ledger.offer(peerId, file, batch) !== null) {
        offered++;
      }
    }
    return offered;
  }, []);

  const acceptTransfer = useCallback((key: string) => transfersRef.current?.accept(key), []);
  const declineTransfer = useCallback((key: string) => transfersRef.current?.decline(key), []);
  const cancelTransfer = useCallback((key: string) => transfersRef.current?.cancel(key), []);
  const dismissTransfer = useCallback((key: string) => transfersRef.current?.dismiss(key), []);

  const setMic = useCallback((on: boolean) => {
    const media = localMediaRef.current;
    if (!media) {
      return;
    }
    media.getAudioTracks().forEach((track) => {
      track.enabled = on;
    });
    micOnRef.current = on;
    setMicOn(on);
    // A disabled track still flows (as silence), so nothing on the mesh
    // says the mic is off: the room is told for the others' tiles.
    signalingRef.current?.send({ t: 'mute', on: !on });
  }, []);

  /** What the mic was before the speakers went off, to put it back after. */
  const micBeforeDeafenRef = useRef(true);

  const setSpeaker = useCallback((on: boolean) => {
    speakerOnRef.current = on;
    setSpeakerOn(on);
    signalingRef.current?.send({ t: 'deafen', on: !on });
  }, []);

  /**
   * Unmuting the mic while the speakers are off brings the speakers back
   * too: talking to people you cannot hear is never what was meant.
   */
  const toggleMic = useCallback(() => {
    const media = localMediaRef.current;
    if (!media) {
      return;
    }
    const next = !media.getAudioTracks().some((track) => track.enabled);
    setMic(next);
    if (next && !speakerOnRef.current) {
      setSpeaker(true);
    }
  }, [setMic, setSpeaker]);

  /**
   * Speakers off. Playback is muted in the view (every remote sink reads
   * `speakerOn`) and the mic goes with it — someone who is not listening
   * should not be heard either; the room is told so the others see it on
   * the tile. Coming back restores the mic to what it was before.
   */
  const toggleSpeaker = useCallback(() => {
    const next = !speakerOnRef.current;
    if (!next) {
      const media = localMediaRef.current;
      micBeforeDeafenRef.current = media
        ? media.getAudioTracks().some((track) => track.enabled)
        : true;
      setMic(false);
    } else if (micBeforeDeafenRef.current) {
      setMic(true);
    }
    setSpeaker(next);
  }, [setMic, setSpeaker]);

  const toggleCam = useCallback(() => {
    const videoTrack = localMediaRef.current?.getVideoTracks()[0];
    if (videoTrack?.enabled) {
      // Off is unconditional and frees the slot for someone else.
      videoTrack.enabled = false;
      setCamOn(false);
      camWantedRef.current = false;
      signalingRef.current?.send({ t: 'camera-stop' });
      return;
    }
    // On goes through the server (optimistic-off): the track only lights
    // up — or gets acquired — when camera-started answers; camera-denied
    // surfaces as camDenied instead.
    if (camPendingRef.current) {
      return;
    }
    camWantedRef.current = true;
    camPendingRef.current = true;
    setCamDenied(false);
    signalingRef.current?.send({ t: 'camera-request' });
  }, []);

  /**
   * The guard's readings, for the HUD. It reports once a second from the
   * audio thread, so this only carries the latest across; the interval
   * exists at all only while we are sharing sound.
   */
  useEffect(() => {
    if (!localScreen || !screenGuardRef.current) {
      return;
    }
    const read = () => setScreenAudioGuard(screenGuardRef.current?.guard.stats() ?? null);
    read();
    const timer = setInterval(read, 1000);
    return () => clearInterval(timer);
  }, [localScreen]);

  const startScreenShare = useCallback(async () => {
    if (pendingScreenRef.current || localScreenRef.current) {
      return;
    }
    try {
      const preset = presetById(qualityRef.current);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: screenConstraints(preset),
        // Opt-in via settings, off by default. In Chromium browsers the
        // picker offers tab/system audio; Firefox/Safari return video-only,
        // which is harmless. No microphone processing touches program
        // audio; capable browsers only remove this document's own playback.
        audio: mediaSettingsRef.current.screenAudio
          ? screenAudioConstraints(mediaSettingsRef.current.screenAudioGuard)
          : false,
      });
      pendingScreenRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        // Tells the codec what to preserve: text sharpness or motion fluidity.
        track.contentHint = preset.contentHint;
        // Wired BEFORE anything awaits below it. A track that ends while we
        // are still working — the browser's own "Stop sharing", the OS
        // revoking the capture — dispatches `ended` once and only to a
        // handler that already exists. Registering it after an await meant
        // that stop was never heard: we went on to claim a screen slot,
        // published dead tracks into it, and nothing was left that could
        // ever send `screen-stop`, so the slot was held until the peer
        // left and the sharer's own key did nothing until a reload.
        track.onended = () => {
          signalingRef.current?.send({ t: 'screen-stop' });
          dropLocalScreen();
        };
      }
      // Take the room back out of the capture before anybody else hears
      // it. The clean track REPLACES the raw one inside the same stream,
      // so the id already sent to the server still names what viewers
      // will receive, and everything downstream — the publish below, the
      // relay tree, the teardown — goes on seeing one display stream.
      // The native guard and this one are layers, not alternatives: the
      // constraint only excludes the capturing tab's own playback, so the
      // case that hurts most — the Electron shell capturing the whole
      // system with `audio: 'loopback'` — never reports it, and the
      // worklet stays the only thing taking the room back out. We skip the
      // worklet solely when the captured track confirms the platform
      // already did the job.
      const captured = stream.getAudioTracks()[0];
      if (
        captured &&
        mediaSettingsRef.current.screenAudioGuard &&
        !nativeScreenAudioGuardActive(captured)
      ) {
        const guard = await guardCapture(captured);
        if (pendingScreenRef.current !== stream || track?.readyState === 'ended') {
          // Given up on, refused or replaced while the worklet loaded — or
          // stopped in that window, which `onended` above has handled or is
          // about to. Either way there is nothing left to publish.
          guard.stop();
          return;
        }
        if (guard.guarded) {
          screenGuardRef.current = { guard, raw: captured };
          stream.removeTrack(captured);
          stream.addTrack(guard.track);
        }
      }
      // The lock belongs to the server: publish only when screen-started arrives.
      signalingRef.current?.send({
        t: 'screen-request',
        streamId: stream.id,
        quality: qualityRef.current,
      });
    } catch {
      // the user dismissed the picker
    }
  }, [dropLocalScreen]);

  const stopScreenShare = useCallback(() => {
    signalingRef.current?.send({ t: 'screen-stop' });
    dropLocalScreen();
    setScreens((current) => current.filter((share) => share.id !== selfIdRef.current));
  }, [dropLocalScreen]);

  /**
   * Says what a tool's state is, for everybody; null turns it off for the
   * room. Nothing is applied locally — the state that comes back from the
   * server is the one the whole room (this client included) works from,
   * so nobody can drift into a private idea of what is going on.
   */
  const setToolState = useCallback((tool: string, state: unknown) => {
    signalingRef.current?.send({ t: 'tool-state', tool, state: state ?? null });
  }, []);

  const leave = useCallback(() => {
    setStatus({ kind: 'ended', reason: 'left' });
    // A deliberate goodbye skips the server's resume grace.
    signalingRef.current?.send({ t: 'leave' });
    signalingRef.current?.close();
  }, []);

  // No free slot for THIS peer to turn a camera on: live cameras fill the
  // cap for the current room size, and none of them is ours. Grandfathered
  // cameras can hold the roster above the cap; they still count.
  const cameraSlotsFull =
    !camOn &&
    (selfId === null || !cameras.has(selfId)) &&
    cameras.size >= cameraSlotsFor(peers.length + 1);

  return {
    status,
    reconnecting,
    selfId,
    peers,
    chat,
    chatLocked,
    transfers,
    screen,
    screenSource,
    screens,
    screenSources,
    screenStreamIds,
    watchScreen,
    localMedia,
    localScreen,
    screenAudioGuard,
    micOn,
    camOn,
    speakerOn,
    deafened,
    muted,
    cameras,
    cameraSlotsFull,
    camDenied,
    screenQuality,
    mediaSettings,
    participation,
    audioDevices,
    peerLatency,
    signalRttMs,
    screenStats,
    tools,
    toolDenied,
    mesh: meshRef.current,
    setScreenQuality,
    updateMediaSettings,
    updateParticipation,
    updateAudioDevices,
    sendChat,
    sendFile,
    acceptTransfer,
    declineTransfer,
    cancelTransfer,
    dismissTransfer,
    toggleMic,
    toggleSpeaker,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    setToolState,
    leave,
  };
}
