import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
import { importRoomKey, openChat, sealChat } from './chat-crypto';
import { FileTransfers, type FileTransfer } from './file-transfer';
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
import { ScreenRelayController, extractRelayNote, makeRelayNote } from './screen-relay';
import {
  advanceAudioStall,
  advanceStall,
  initialStallState,
  type StallState,
} from './stall-watch';
import {
  allowHiFiOpus,
  cameraConstraints,
  cameraEncoding as cameraUserCaps,
  cameraPresetById,
  loadMediaSettings,
  micConstraints,
  micContentHint,
  micEncoding,
  saveMediaSettings,
  screenAudioConstraints,
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

export interface ChatMessage {
  from: PeerInfo;
  text: string;
  ts: number;
  /** Sealed for a key this client does not hold: render a placeholder. */
  unreadable?: boolean;
}

export type RoomStatus =
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'ended'; reason: 'closed' | 'left' | 'room_not_found' | 'room_full' | 'invalid_name' };

const MAX_CHAT_MESSAGES = 200;
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
  const [screen, setScreen] = useState<{ id: string; streamId: string } | null>(null);
  const [localMedia, setLocalMedia] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(options.micEnabled);
  // Optimistic-off: the camera starts dark and lights up only on the
  // server's grant (camera-started) — never before.
  const [camOn, setCamOn] = useState(false);
  /** Peers holding a camera slot right now (self included when granted). */
  const [cameras, setCameras] = useState<Set<string>>(new Set());
  /** A camera-denied just landed: the UI shows why the toggle did nothing. */
  const [camDenied, setCamDenied] = useState(false);
  const [screenQuality, setScreenQualityState] = useState<ScreenQualityId>(loadQuality);
  /** User-tunable media prefs (mic profile, camera ceiling, screen audio). */
  const [mediaSettings, setMediaSettings] = useState<MediaSettings>(loadMediaSettings);
  /** Per-machine device choice: which mic captures, where playback goes. */
  const [audioDevices, setAudioDevices] = useState<AudioDevicePrefs>(loadAudioDevicePrefs);
  const [peerLatency, setPeerLatency] = useState<Map<string, PeerLatency>>(new Map());
  const [signalRttMs, setSignalRttMs] = useState<number | null>(null);
  const [screenStats, setScreenStats] = useState<ScreenStats | null>(null);
  /** Who I receive the screen from in the tree (may be a relay, not the sharer). */
  const [screenSource, setScreenSource] = useState<{ id: string; streamId: string } | null>(null);
  const [meshVersion, bumpVersion] = useReducer((v: number) => v + 1, 0);

  const signalingRef = useRef<Signaling | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  /** One per mesh: a fresh seat gets fresh channels and a fresh ledger. */
  const transfersRef = useRef<FileTransfers | null>(null);
  const localMediaRef = useRef<MediaStream | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const pendingScreenRef = useRef<MediaStream | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);
  const qualityRef = useRef<ScreenQualityId>(screenQuality);
  /** Mirror for callbacks (share start) that must not close over state. */
  const mediaSettingsRef = useRef<MediaSettings>(mediaSettings);
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
  const lastPongRef = useRef(0);
  /** Latest route received from the screen-forwarding tree. */
  const routeRef = useRef<{
    children: string[];
    source: { id: string; streamId: string } | null;
    quality: ScreenQualityId;
  } | null>(null);
  /** Local stream that forwards the parent's screen to the children. */
  const forwardStreamRef = useRef<MediaStream | null>(null);
  const forwardedTrackRef = useRef<MediaStreamTrack | null>(null);
  const reportedRelayStreamRef = useRef<string | null>(null);
  /** Encoded passthrough at the relay position; null = re-encode only. */
  const relayControllerRef = useRef<ScreenRelayController | null>(null);
  /** Viewer-side stall watch: flat framesDecoded escalates (stall-watch.ts). */
  const screenStallRef = useRef<StallState>(initialStallState());
  /** Per-peer voice watch: a flat inbound packet counter restarts that leg's ICE. */
  const audioStallRef = useRef(new Map<string, StallState>());
  /** AV1-first when hardware-encodable at the current preset; null = browser default. */
  const screenCodecsRef = useRef<RTCRtpCodec[] | null>(null);
  /** Imported once per session from options.roomKey; survives resumes. */
  const chatKeyRef = useRef<CryptoKey | null>(null);
  /** Serializes async decryption so messages land in arrival order. */
  const chatQueueRef = useRef<Promise<void>>(Promise.resolve());
  /** Mirror of chatLocked for callbacks that must not close over state. */
  const chatLockedRef = useRef(false);
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
    pendingScreenRef.current = null;
    localScreenRef.current = null;
    // The next share re-learns the link instead of inheriting this one's verdict.
    screenLadderRef.current = initialAdaptiveState();
    setLocalScreen(null);
    setScreenStats(null);
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
    const receivers = routeRef.current?.children.length ?? viewerCountRef.current;
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

  /** Undoes the relay role: stops forwarding without touching the remote track. */
  const teardownRelay = useCallback(() => {
    relayControllerRef.current?.close();
    relayControllerRef.current = null;
    const forwarded = forwardedTrackRef.current;
    if (forwarded) {
      meshRef.current?.removeLocalTrack(forwarded);
      forwardStreamRef.current?.removeTrack(forwarded);
    }
    forwardedTrackRef.current = null;
    forwardStreamRef.current = null;
    reportedRelayStreamRef.current = null;
  }, []);

  /**
   * Reconciles this peer's role in the screen-forwarding tree.
   *
   * Called when the route changes and when the mesh notifies (the
   * parent's track may arrive after the route). Sharer: applies targets
   * and the split to the local track. Relay: announces its forwarding
   * stream and wires the track received from the parent to the children.
   * Leaf: undoes any forwarding.
   */
  const syncScreenTree = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }
    const route = routeRef.current;

    const localTrack = localScreenRef.current?.getVideoTracks()[0];
    if (localTrack) {
      mesh.setTrackTargets(localTrack, route?.children ?? []);
      mesh.setTrackEncoding(localTrack, screenEncoding());
      return;
    }

    if (!route || route.children.length === 0) {
      teardownRelay();
      return;
    }

    const stream = forwardStreamRef.current ?? new MediaStream();
    forwardStreamRef.current = stream;
    if (reportedRelayStreamRef.current !== stream.id) {
      reportedRelayStreamRef.current = stream.id;
      signalingRef.current?.send({ t: 'screen-relay', streamId: stream.id });
    }

    const parentTrack = route.source
      ? (mesh
          .getPeerStreams(route.source.id)
          .find((s) => s.id === route.source!.streamId)
          ?.getVideoTracks()[0] ?? null)
      : null;

    const forwarded = forwardedTrackRef.current;
    if (forwarded && forwarded !== parentTrack) {
      // Parent changed (a relay dropped, the tree moved): let go of the old track.
      mesh.removeLocalTrack(forwarded);
      stream.removeTrack(forwarded);
      forwardedTrackRef.current = null;
    }
    if (parentTrack && route.source && forwardedTrackRef.current !== parentTrack) {
      stream.addTrack(parentTrack);
      forwardedTrackRef.current = parentTrack;
      if (!relayControllerRef.current && ScreenRelayController.supported()) {
        relayControllerRef.current = new ScreenRelayController(mesh);
      }
      const controller = relayControllerRef.current;
      // Passthrough wants the children on the upstream's codec, and the
      // preference must land in the same tick as addTrack (see addSender).
      // Without a controller, a relay re-encodes and the codec gate
      // (hardware AV1 or default) is its own.
      const pinned = controller?.childCodecPreferences(
        route.source.id,
        parentTrack,
        screenCodecsRef.current !== null,
      );
      mesh.addLocalTrack(
        parentTrack,
        stream,
        relayEncoding(route),
        route.children,
        pinned ?? screenCodecsRef.current,
      );
      controller?.sync(route.source.id, parentTrack, route.children);
    } else if (parentTrack && route.source) {
      mesh.setTrackTargets(parentTrack, route.children);
      mesh.setTrackEncoding(parentTrack, relayEncoding(route));
      relayControllerRef.current?.sync(route.source.id, parentTrack, route.children);
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

    function handleMessage(message: ServerMessage): void {
      switch (message.t) {
        case 'welcome': {
          setReconnecting(false);
          signalingRef.current?.setResumeToken(message.resumeToken);
          const resumed = meshRef.current !== null && selfIdRef.current === message.selfId;
          selfIdRef.current = message.selfId;
          setSelfId(message.selfId);
          setPeers(message.peers);
          setScreen(message.screen);
          const cameraRoster = new Set(message.cameras);
          setCameras(cameraRoster);
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
            if (!message.screen) {
              // The share ended while we were away (ours may have hit the
              // lock's grace); the missed screen-stopped is applied here.
              routeRef.current = null;
              teardownRelay();
              dropLocalScreen();
            }
            // Our tree role arrives in the screen-route the server re-emits.
          } else {
            // A fresh seat means a fresh mesh: any relay wiring (forward
            // stream, passthrough pipe) belonged to the old one — and so
            // did the congestion ladders' verdicts about its links.
            teardownRelay();
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
          setStatus({ kind: 'connected' });
          return;
        }
        case 'peer-joined':
          // The newly arrived peer initiates; here we only record the name.
          setPeers((current) => [...current.filter((p) => p.id !== message.peer.id), message.peer]);
          // Presence cue. It rides on the event, not on a diff of the roster,
          // so a resume — which replays the whole roster in `welcome` — stays
          // silent instead of announcing everyone who was already there.
          playJoinChime();
          return;
        case 'peer-left':
          meshRef.current?.removePeer(message.id);
          transfersRef.current?.detach(message.id);
          playLeaveChime();
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
          return;
        case 'signal': {
          // Relay-health notes ride the same opaque envelope as SDP/ICE
          // (the server never inspects `data`): peel ours off, let the
          // mesh no-op anything a newer client may add.
          if (extractRelayNote(message.data)) {
            relayControllerRef.current?.handleStallNote(message.from);
            return;
          }
          void meshRef.current?.handleSignal(message.from, message.data);
          return;
        }
        case 'chat': {
          // Opening the envelope is async; the queue keeps arrival order.
          const { from, ts } = message;
          chatQueueRef.current = chatQueueRef.current.then(async () => {
            const opened = await openChat(chatKeyRef.current, message.text);
            if (cancelled) {
              return;
            }
            if (opened.unreadable && !chatKeyRef.current) {
              chatLockedRef.current = true;
              setChatLocked(true);
            }
            const entry: ChatMessage = opened.unreadable
              ? { from, ts, text: '', unreadable: true }
              : { from, ts, text: opened.text };
            setChat((current) => [...current.slice(-MAX_CHAT_MESSAGES + 1), entry]);
          });
          return;
        }
        case 'screen-started': {
          setScreen({ id: message.id, streamId: message.streamId });
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
                // System audio goes out like the mic — straight to every
                // peer, never through the tree: ~128 kbps × 7 is nothing
                // next to one video hop, and it skips the relays' latency.
                // Riding the display stream tags it: viewers key on the
                // announced streamId to exclude it from camera tiles and
                // play it beside the (muted) stage video.
                meshRef.current?.addLocalTrack(track, stream);
              }
              syncScreenTree();
            }
          }
          return;
        }
        case 'screen-route':
          routeRef.current = {
            children: message.children,
            source: message.source,
            quality: message.quality,
          };
          setScreenSource(message.source);
          syncScreenTree();
          return;
        case 'screen-stopped':
          setScreen(null);
          setScreenSource(null);
          routeRef.current = null;
          teardownRelay();
          dropLocalScreen();
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
        case 'pong':
          lastPongRef.current = Date.now();
          setSignalRttMs(Math.max(0, Math.round(Date.now() - message.ts)));
          return;
        case 'error':
          // A refused resume means the seat was swept: to the user, the
          // connection was simply lost.
          setStatus({
            kind: 'ended',
            reason: message.code === 'resume_invalid' ? 'closed' : message.code,
          });
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
      signalingRef.current?.close();
      signalingRef.current = null;
      meshRef.current?.close();
      meshRef.current = null;
      transfersRef.current?.close();
      transfersRef.current = null;
      routeRef.current = null;
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
        stats.relayMode = relayControllerRef.current?.modeSummary() ?? null;
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
        void mic.applyConstraints(micConstraints(next.mic)).catch(() => {
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

  const sendChat = useCallback((text: string) => {
    const key = chatKeyRef.current;
    if (!key) {
      if (chatLockedRef.current) {
        // The room is provably sealed and this client has no key:
        // refuse the silent plaintext downgrade.
        return;
      }
      // No key and no evidence of one (a pre-key room): plaintext relays.
      signalingRef.current?.send({ t: 'chat', text });
      return;
    }
    void sealChat(key, text).then((sealed) =>
      signalingRef.current?.send({ t: 'chat', text: sealed }),
    );
  }, []);

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
    for (const peerId of mesh.peerIds()) {
      if (ledger.offer(peerId, file) !== null) {
        offered++;
      }
    }
    return offered;
  }, []);

  const acceptTransfer = useCallback((key: string) => transfersRef.current?.accept(key), []);
  const declineTransfer = useCallback((key: string) => transfersRef.current?.decline(key), []);
  const cancelTransfer = useCallback((key: string) => transfersRef.current?.cancel(key), []);
  const dismissTransfer = useCallback((key: string) => transfersRef.current?.dismiss(key), []);

  const toggleMic = useCallback(() => {
    const media = localMediaRef.current;
    if (!media) {
      return;
    }
    const next = !media.getAudioTracks().some((track) => track.enabled);
    media.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicOn(next);
  }, []);

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
        // which is harmless. The capture rides raw (no processing chain).
        audio: mediaSettingsRef.current.screenAudio ? screenAudioConstraints() : false,
      });
      pendingScreenRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        // Tells the codec what to preserve: text sharpness or motion fluidity.
        track.contentHint = preset.contentHint;
        track.onended = () => {
          signalingRef.current?.send({ t: 'screen-stop' });
          dropLocalScreen();
        };
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
    setScreen((current) => (current?.id === selfIdRef.current ? null : current));
  }, [dropLocalScreen]);

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
    localMedia,
    localScreen,
    micOn,
    camOn,
    cameras,
    cameraSlotsFull,
    camDenied,
    screenQuality,
    mediaSettings,
    audioDevices,
    peerLatency,
    signalRttMs,
    screenStats,
    mesh: meshRef.current,
    setScreenQuality,
    updateMediaSettings,
    updateAudioDevices,
    sendChat,
    sendFile,
    acceptTransfer,
    declineTransfer,
    cancelTransfer,
    dismissTransfer,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    leave,
  };
}
