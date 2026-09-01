import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Mesh } from './mesh';
import { Signaling } from './signaling';
import type { PeerInfo, ServerMessage } from './protocol';

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
  const [, bumpVersion] = useReducer((v: number) => v + 1, 0);

  const signalingRef = useRef<Signaling | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const localMediaRef = useRef<MediaStream | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const pendingScreenRef = useRef<MediaStream | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);

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
                meshRef.current?.addLocalTrack(track, stream);
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
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      pendingScreenRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
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
    mesh: meshRef.current,
    sendChat,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    leave,
  };
}
