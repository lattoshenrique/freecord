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
  /** De quem EU recebo a tela na árvore (pode ser um relay, não o sharer). */
  const [screenSource, setScreenSource] = useState<{ id: string; streamId: string } | null>(null);
  const [meshVersion, bumpVersion] = useReducer((v: number) => v + 1, 0);

  const signalingRef = useRef<Signaling | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const localMediaRef = useRef<MediaStream | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const pendingScreenRef = useRef<MediaStream | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);
  const qualityRef = useRef<ScreenQualityId>(screenQuality);
  const viewerCountRef = useRef(0);
  const lastPongRef = useRef(0);
  /** Última rota recebida da árvore de retransmissão da tela. */
  const routeRef = useRef<{
    children: string[];
    source: { id: string; streamId: string } | null;
    quality: ScreenQualityId;
  } | null>(null);
  /** Stream local que reencaminha a tela do pai para os filhos. */
  const forwardStreamRef = useRef<MediaStream | null>(null);
  const forwardedTrackRef = useRef<MediaStreamTrack | null>(null);
  const reportedRelayStreamRef = useRef<string | null>(null);

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

  /**
   * Teto de envio da tela: preset rateado pelo nº de FILHOS na árvore —
   * no máximo SCREEN_FANOUT, independente do tamanho da sala. Antes da
   * rota chegar, o rateio conservador usa o nº de pares.
   */
  const screenEncoding = useCallback((): TrackEncoding => {
    const preset = presetById(qualityRef.current);
    const receivers = routeRef.current?.children.length ?? viewerCountRef.current;
    return {
      maxBitrate: bitrateFor(preset, receivers),
      maxFramerate: preset.frameRate,
      degradationPreference: preset.degradationPreference,
    };
  }, []);

  /** Teto de reencaminhamento de um relay: preset do sharer, rateado pelos filhos. */
  const relayEncoding = useCallback(
    (route: { children: string[]; quality: ScreenQualityId }): TrackEncoding => {
      const preset = presetById(route.quality);
      return {
        maxBitrate: bitrateFor(preset, route.children.length),
        maxFramerate: preset.frameRate,
        degradationPreference: preset.degradationPreference,
      };
    },
    [],
  );

  /** Desfaz o papel de relay: para de reencaminhar sem tocar no track remoto. */
  const teardownRelay = useCallback(() => {
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
   * Reconcilia o papel deste par na árvore de retransmissão da tela.
   *
   * Chamado quando a rota muda e quando o mesh notifica (o track do pai
   * pode chegar depois da rota). Sharer: aplica alvos e rateio no track
   * local. Relay: anuncia o stream de reencaminhamento e liga o track
   * recebido do pai aos filhos. Folha: desfaz qualquer reencaminhamento.
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
      // Troca de pai (relay caiu, árvore mudou): solta o track antigo.
      mesh.removeLocalTrack(forwarded);
      stream.removeTrack(forwarded);
      forwardedTrackRef.current = null;
    }
    if (parentTrack && forwardedTrackRef.current !== parentTrack) {
      stream.addTrack(parentTrack);
      forwardedTrackRef.current = parentTrack;
      mesh.addLocalTrack(parentTrack, stream, relayEncoding(route), route.children);
    } else if (parentTrack) {
      mesh.setTrackTargets(parentTrack, route.children);
      mesh.setTrackEncoding(parentTrack, relayEncoding(route));
    }
  }, [screenEncoding, relayEncoding, teardownRelay]);

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
                // Alvos começam vazios: o screen-route logo atrás diz para
                // quem enviar — na árvore, os filhos; nunca a sala inteira.
                meshRef.current?.addLocalTrack(track, stream, screenEncoding(), []);
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
      routeRef.current = null;
      teardownRelay();
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
      // Na árvore, a tela chega do PAI (talvez um relay) — o RTT medido é
      // até ele, não até quem compartilha.
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
  }, [status.kind, screen, screenSource]);

  // O rateio do uplink muda quando entra ou sai gente (fallback até a rota
  // chegar; com rota, o rateio é pelos filhos e o servidor reemite a rota).
  useEffect(() => {
    viewerCountRef.current = peers.length;
    const track = localScreenRef.current?.getVideoTracks()[0];
    if (track) {
      meshRef.current?.setTrackEncoding(track, screenEncoding());
    }
  }, [peers.length, screenEncoding]);

  // O track do pai pode chegar DEPOIS da rota (negociação em andamento):
  // cada notificação do mesh reavalia o papel deste par na árvore.
  useEffect(() => {
    syncScreenTree();
  }, [meshVersion, syncScreenTree]);

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
        // Reanuncia o lock com a qualidade nova: os relays da árvore
        // recebem o preset atualizado via screen-route.
        const streamId = localScreenRef.current?.id;
        if (streamId) {
          signalingRef.current?.send({ t: 'screen-request', streamId, quality: id });
        }
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
      signalingRef.current?.send({
        t: 'screen-request',
        streamId: stream.id,
        quality: qualityRef.current,
      });
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
    screenSource,
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
