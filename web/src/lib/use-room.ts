import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Mesh, type TrackEncoding } from './mesh';
import { Signaling } from './signaling';
import type { PeerInfo, ServerMessage } from './protocol';
import {
  DEFAULT_SCREEN_QUALITY,
  bitrateFor,
  presetById,
  screenConstraints,
  type ScreenQualityId,
} from './screen-quality';
import { StatsSampler, type PeerLatency, type ScreenStats } from './stats';

export interface JoinOptions {
  slug: string;
  name: string;
  micEnabled: boolean;
  camEnabled: boolean;
}

export interface ChatMessage {
  from: PeerInfo;
  text: string;
  ts: number;
}

export type RoomStatus =
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'ended'; reason: 'closed' | 'left' | 'room_not_found' | 'room_full' | 'invalid_name' };

const MAX_CHAT_MESSAGES = 200;
/** Espelha ROOM_LIMITS.heartbeatIntervalMs do servidor. */
const HEARTBEAT_MS = 10_000;
/** Espelha ROOM_LIMITS.peerTimeoutMs: sem pong nesse tempo, a sessão acabou. */
const PONG_TIMEOUT_MS = 35_000;
const STATS_INTERVAL_MS = 2_000;
const QUALITY_STORAGE_KEY = 'guest-rooms:screen-quality';

function loadQuality(): ScreenQualityId {
  try {
    const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
    return saved === 'nitida' || saved === 'equilibrada' || saved === 'fluida'
      ? saved
      : DEFAULT_SCREEN_QUALITY;
  } catch {
    return DEFAULT_SCREEN_QUALITY;
  }
}

export function useRoomSession(options: JoinOptions) {
  const [status, setStatus] = useState<RoomStatus>({ kind: 'connecting' });
  const [selfId, setSelfId] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [screen, setScreen] = useState<{ id: string; streamId: string } | null>(null);
  const [localMedia, setLocalMedia] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(options.micEnabled);
  const [camOn, setCamOn] = useState(options.camEnabled);
  const [screenQuality, setScreenQualityState] = useState<ScreenQualityId>(loadQuality);
  const [peerLatency, setPeerLatency] = useState<Map<string, PeerLatency>>(new Map());
  const [signalRttMs, setSignalRttMs] = useState<number | null>(null);
  const [screenStats, setScreenStats] = useState<ScreenStats | null>(null);
  const [, bumpVersion] = useReducer((v: number) => v + 1, 0);

  const signalingRef = useRef<Signaling | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const localMediaRef = useRef<MediaStream | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const pendingScreenRef = useRef<MediaStream | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);
  const qualityRef = useRef<ScreenQualityId>(screenQuality);
  const viewerCountRef = useRef(0);
  const lastPongRef = useRef(0);

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
    setLocalScreen(null);
    setScreenStats(null);
  }, []);

  /** Teto de envio da tela agora: preset escolhido rateado pelo nº de pares. */
  const screenEncoding = useCallback((): TrackEncoding => {
    const preset = presetById(qualityRef.current);
    return {
      maxBitrate: bitrateFor(preset, viewerCountRef.current),
      maxFramerate: preset.frameRate,
      degradationPreference: preset.degradationPreference,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      let media: MediaStream | null = null;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: options.camEnabled,
        });
      } catch {
        try {
          media = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          media = null; // entra só ouvindo/vendo
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
      setCamOn(media ? media.getVideoTracks().length > 0 : false);
      localMediaRef.current = media;
      setLocalMedia(media);

      const signaling = new Signaling(options.slug, options.name, {
        onMessage: handleMessage,
        onClose: () => setStatus({ kind: 'ended', reason: 'closed' }),
      });
      signalingRef.current = signaling;
    }

    function handleMessage(message: ServerMessage): void {
      switch (message.t) {
        case 'welcome': {
          selfIdRef.current = message.selfId;
          setSelfId(message.selfId);
          setPeers(message.peers);
          setScreen(message.screen);
          const mesh = new Mesh(message.selfId, (to, data) =>
            signalingRef.current?.send({ t: 'signal', to, data }),
          );
          mesh.subscribe(bumpVersion);
          meshRef.current = mesh;
          const media = localMediaRef.current;
          if (media) {
            for (const track of media.getTracks()) {
              mesh.addLocalTrack(track, media);
            }
          }
          // Quem chega inicia a conexão com quem já estava.
          for (const peer of message.peers) {
            mesh.ensurePeer(peer.id);
          }
          setStatus({ kind: 'connected' });
          return;
        }
        case 'peer-joined':
          // O par recém-chegado inicia; aqui só registramos o nome.
          setPeers((current) => [...current.filter((p) => p.id !== message.peer.id), message.peer]);
          return;
        case 'peer-left':
          meshRef.current?.removePeer(message.id);
          setPeers((current) => current.filter((p) => p.id !== message.id));
          return;
        case 'signal':
          void meshRef.current?.handleSignal(message.from, message.data);
          return;
        case 'chat':
          setChat((current) => [...current.slice(-MAX_CHAT_MESSAGES + 1), message]);
          return;
        case 'screen-started': {
          setScreen({ id: message.id, streamId: message.streamId });
          if (message.id === selfIdRef.current) {
            const stream = pendingScreenRef.current;
            if (stream) {
              pendingScreenRef.current = null;
              localScreenRef.current = stream;
              setLocalScreen(stream);
              for (const track of stream.getTracks()) {
                meshRef.current?.addLocalTrack(track, stream, screenEncoding());
              }
            }
          }
          return;
        }
        case 'screen-stopped':
          setScreen(null);
          dropLocalScreen();
          return;
        case 'screen-denied':
          dropLocalScreen();
          return;
        case 'pong':
          lastPongRef.current = Date.now();
          setSignalRttMs(Math.max(0, Math.round(Date.now() - message.ts)));
          return;
        case 'error':
          setStatus({ kind: 'ended', reason: message.code });
          return;
      }
    }

    void connect();

    return () => {
      cancelled = true;
      signalingRef.current?.close();
      signalingRef.current = null;
      meshRef.current?.close();
      meshRef.current = null;
      dropLocalScreen();
      localMediaRef.current?.getTracks().forEach((track) => track.stop());
      localMediaRef.current = null;
    };
    // opções de join são estáveis para uma sessão de sala
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.slug, options.name]);

  /**
   * Heartbeat: mede a latência de sinalização e prova ao servidor que a
   * conexão está viva — sem isso o par vira zumbi e é expulso.
   *
   * Também vale ao contrário: rede que some não entrega frame de close
   * nenhum, então o silêncio do servidor é o que encerra a sessão aqui.
   */
  useEffect(() => {
    if (status.kind !== 'connected') {
      return;
    }
    lastPongRef.current = Date.now();
    const beat = () => {
      if (Date.now() - lastPongRef.current > PONG_TIMEOUT_MS) {
        signalingRef.current?.close();
        setStatus({ kind: 'ended', reason: 'closed' });
        return;
      }
      signalingRef.current?.send({ t: 'ping', ts: Date.now() });
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [status.kind]);

  // Amostragem periódica de getStats(): latência por par e qualidade real
  // da tela. Um sampler só, para o bitrate ter delta entre leituras.
  useEffect(() => {
    if (status.kind !== 'connected') {
      return;
    }
    const sampler = new StatsSampler();
    let stopped = false;

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

      const sharing = localScreenRef.current?.getVideoTracks()[0] ?? null;
      const watching =
        screen && screen.id !== selfIdRef.current
          ? (mesh
              .getPeerStreams(screen.id)
              .find((stream) => stream.id === screen.streamId)
              ?.getVideoTracks()[0] ?? null)
          : null;
      const stats = sharing
        ? await sampler.sendingScreen(mesh, sharing)
        : watching && screen
          ? await sampler.receivingScreen(mesh, screen.id, watching)
          : null;
      if (!stopped) {
        setScreenStats(stats);
      }
    };

    void sample();
    const timer = setInterval(() => void sample(), STATS_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [status.kind, screen]);

  // O rateio do uplink muda quando entra ou sai gente.
  useEffect(() => {
    viewerCountRef.current = peers.length;
    const track = localScreenRef.current?.getVideoTracks()[0];
    if (track) {
      meshRef.current?.setTrackEncoding(track, screenEncoding());
    }
  }, [peers.length, screenEncoding]);

  /** Troca de preset: vale na hora, sem reiniciar o compartilhamento. */
  const setScreenQuality = useCallback(
    (id: ScreenQualityId) => {
      qualityRef.current = id;
      setScreenQualityState(id);
      try {
        localStorage.setItem(QUALITY_STORAGE_KEY, id);
      } catch {
        // navegação privada: a escolha vale só nesta sessão
      }
      const track = localScreenRef.current?.getVideoTracks()[0];
      if (track) {
        const preset = presetById(id);
        track.contentHint = preset.contentHint;
        void track.applyConstraints(screenConstraints(preset)).catch(() => {
          // a fonte não aceita a resolução pedida: o teto de envio ainda vale
        });
        meshRef.current?.setTrackEncoding(track, screenEncoding());
      }
    },
    [screenEncoding],
  );

  const sendChat = useCallback((text: string) => {
    signalingRef.current?.send({ t: 'chat', text });
  }, []);

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

  const toggleCam = useCallback(async () => {
    const media = localMediaRef.current;
    const videoTrack = media?.getVideoTracks()[0];
    if (media && videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setCamOn(videoTrack.enabled);
      return;
    }
    // Câmera não foi pedida no pré-join: adquire e renegocia agora.
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = cam.getVideoTracks()[0];
      if (!track) {
        return;
      }
      const target = media ?? new MediaStream();
      target.addTrack(track);
      if (!media) {
        localMediaRef.current = target;
        setLocalMedia(target);
      } else {
        setLocalMedia(media);
      }
      meshRef.current?.addLocalTrack(track, target);
      setCamOn(true);
      bumpVersion();
    } catch {
      // permissão negada: mantém sem câmera
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    if (pendingScreenRef.current || localScreenRef.current) {
      return;
    }
    try {
      const preset = presetById(qualityRef.current);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: screenConstraints(preset),
        audio: false,
      });
      pendingScreenRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        // Diz ao codec o que preservar: nitidez de texto ou fluidez de movimento.
        track.contentHint = preset.contentHint;
        track.onended = () => {
          signalingRef.current?.send({ t: 'screen-stop' });
          dropLocalScreen();
        };
      }
      // O lock é do servidor: só publica quando vier screen-started.
      signalingRef.current?.send({ t: 'screen-request', streamId: stream.id });
    } catch {
      // usuário cancelou o seletor
    }
  }, [dropLocalScreen]);

  const stopScreenShare = useCallback(() => {
    signalingRef.current?.send({ t: 'screen-stop' });
    dropLocalScreen();
    setScreen((current) => (current?.id === selfIdRef.current ? null : current));
  }, [dropLocalScreen]);

  const leave = useCallback(() => {
    setStatus({ kind: 'ended', reason: 'left' });
    signalingRef.current?.close();
  }, []);

  return {
    status,
    selfId,
    peers,
    chat,
    screen,
    localMedia,
    localScreen,
    micOn,
    camOn,
    screenQuality,
    peerLatency,
    signalRttMs,
    screenStats,
    mesh: meshRef.current,
    setScreenQuality,
    sendChat,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    leave,
  };
}
