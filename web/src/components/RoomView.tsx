import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RoomSummary } from '../api';
import { useRoomSession, type JoinOptions } from '../lib/use-room';
import InviteButton from './InviteButton';
import {
  CamIcon,
  CamOffIcon,
  ChatIcon,
  CloseIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  ScreenIcon,
  SendIcon,
} from './icons';

function MediaView({
  stream,
  muted,
  className,
}: {
  stream: MediaStream;
  muted: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function AudioSink({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function hasLiveVideo(stream: MediaStream): boolean {
  return stream.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled);
}

/** Cor de avatar estável derivada do nome. */
function avatarHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

const TILE_GAP = 12;
const TILE_RATIO = 16 / 9;

/**
 * Calcula o maior tamanho de tile 16:9 que faz `count` tiles caberem no
 * contêiner (estilo Meet): testa cada nº de colunas e fica com o melhor.
 */
function useTileGrid(count: number) {
  // Callback ref via estado: o contêiner só monta depois de "connecting",
  // então o efeito precisa reagir ao elemento aparecer, não só ao count.
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
  stream,
  style,
}: {
  name: string;
  isSelf: boolean;
  micOff: boolean;
  stream: MediaStream | null;
  style?: React.CSSProperties;
}) {
  const showVideo = stream !== null && hasLiveVideo(stream);
  return (
    <div className="tile" style={style}>
      {showVideo ? (
        <MediaView stream={stream} muted={isSelf} className={`tile-video ${isSelf ? 'mirrored' : ''}`} />
      ) : (
        <>
          <div
            className="tile-avatar"
            style={{ background: `hsl(${avatarHue(name)} 60% 52%)` }}
            aria-hidden
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
          {!isSelf && stream && <AudioSink stream={stream} />}
        </>
      )}
      <span className="tile-name">
        {micOff && (
          <span className="tile-mic-off" title="Microfone desativado">
            <MicOffIcon />
          </span>
        )}
        {name}
        {isSelf && <span className="tile-you"> · você</span>}
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
  const session = useRoomSession(options);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    if (!chatOpen && chatCount > seenCountRef.current) {
      setUnread((n) => n + (chatCount - seenCountRef.current));
    }
    seenCountRef.current = chatCount;
  }, [chatCount, chatOpen]);

  // Computado a cada render de propósito: streams remotos chegam por
  // notificação do mesh (re-render sem mudança de estado React) — um
  // useMemo aqui devolveria o valor cacheado e nunca veria o stream.
  const screenStream = !session.screen
    ? null
    : session.screen.id === session.selfId
      ? session.localScreen
      : (session.mesh
          ?.getPeerStreams(session.screen.id)
          .find((stream) => stream.id === session.screen?.streamId) ?? null);

  const participantCount = session.peers.length + 1;
  const grid = useTileGrid(screenStream ? 0 : participantCount);

  if (status.kind === 'ended' && status.reason !== 'left') {
    const message =
      status.reason === 'room_full'
        ? 'A sala está cheia (máximo de 8 pessoas).'
        : status.reason === 'room_not_found'
          ? 'A sala não existe mais.'
          : 'A conexão com a sala caiu.';
    return (
      <main className="centered fade-in">
        <h1>Você saiu da sala</h1>
        <p>{message}</p>
        <Link to="/" className="button-link">
          Voltar ao início
        </Link>
      </main>
    );
  }

  if (status.kind === 'connecting') {
    return (
      <main className="centered fade-in">
        <div className="spinner" aria-hidden />
        <p>Conectando à sala…</p>
      </main>
    );
  }

  const iAmSharing = session.screen !== null && session.screen.id === session.selfId;
  const someoneElseSharing = session.screen !== null && session.screen.id !== session.selfId;
  const sharerName = someoneElseSharing
    ? (session.peers.find((p) => p.id === session.screen?.id)?.name ?? 'Alguém')
    : null;

  const tileStyle = !screenStream && grid.size ? { width: grid.size.width, height: grid.size.height } : undefined;

  return (
    <div className="room-layout">
      <header className="room-header">
        <div className="room-title">
          <h1>{room.displayName}</h1>
          <span className="room-count">
            {participantCount} {participantCount === 1 ? 'participante' : 'participantes'}
          </span>
        </div>
        <InviteButton />
      </header>

      <div className="room-body">
        <div className="stage-area">
          {screenStream && (
            <div className="screen-stage fade-in">
              <MediaView stream={screenStream} muted className="screen-video" />
              {sharerName && <span className="screen-label">Tela de {sharerName}</span>}
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
              stream={session.localMedia && session.camOn ? session.localMedia : null}
              style={tileStyle}
            />
            {session.peers.map((peer) => {
              const streams = session.mesh?.getPeerStreams(peer.id) ?? [];
              const cameraStream =
                streams.find((stream) => stream.id !== session.screen?.streamId) ?? null;
              return (
                <Tile
                  key={peer.id}
                  name={peer.name}
                  isSelf={false}
                  micOff={false}
                  stream={cameraStream}
                  style={tileStyle}
                />
              );
            })}
          </div>
        </div>

        {chatOpen && (
          <aside className="chat-panel">
            <header className="chat-header">
              <h2>Chat da sala</h2>
              <button
                type="button"
                className="chat-close"
                aria-label="Fechar chat"
                onClick={() => setChatOpen(false)}
              >
                <CloseIcon />
              </button>
            </header>
            <div className="chat-messages">
              {session.chat.length === 0 && (
                <p className="chat-empty">Nenhuma mensagem ainda. Diga um oi 👋</p>
              )}
              {session.chat.map((message, index) => {
                const mine = message.from.id === session.selfId;
                return (
                  <div key={`${message.ts}-${index}`} className={`chat-bubble ${mine ? 'mine' : ''}`}>
                    {!mine && <span className="chat-author">{message.from.name}</span>}
                    <p>{message.text}</p>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <form
              className="chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                const text = draft.trim();
                if (text) {
                  session.sendChat(text);
                  setDraft('');
                }
              }}
            >
              <input
                type="text"
                value={draft}
                maxLength={500}
                placeholder="Mensagem…"
                aria-label="Mensagem do chat"
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" aria-label="Enviar mensagem" disabled={!draft.trim()}>
                <SendIcon />
              </button>
            </form>
          </aside>
        )}
      </div>

      <footer className="room-footer">
        <div className="controls">
          <button
            type="button"
            className={`control ${session.micOn ? '' : 'control-off'}`}
            aria-pressed={!session.micOn}
            title={session.micOn ? 'Silenciar microfone' : 'Ativar microfone'}
            onClick={session.toggleMic}
          >
            {session.micOn ? <MicIcon /> : <MicOffIcon />}
          </button>
          <button
            type="button"
            className={`control ${session.camOn ? '' : 'control-off'}`}
            aria-pressed={!session.camOn}
            title={session.camOn ? 'Desligar câmera' : 'Ligar câmera'}
            onClick={() => void session.toggleCam()}
          >
            {session.camOn ? <CamIcon /> : <CamOffIcon />}
          </button>
          <button
            type="button"
            className={`control ${iAmSharing ? 'control-active' : ''}`}
            aria-pressed={iAmSharing}
            disabled={someoneElseSharing}
            title={
              someoneElseSharing
                ? 'Outra pessoa já está compartilhando a tela'
                : iAmSharing
                  ? 'Parar de compartilhar'
                  : 'Compartilhar tela'
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
            className={`control ${chatOpen ? 'control-active' : ''}`}
            aria-pressed={chatOpen}
            title={chatOpen ? 'Fechar chat' : 'Abrir chat'}
            onClick={() => setChatOpen((open) => !open)}
          >
            <ChatIcon />
            {unread > 0 && <span className="control-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button
            type="button"
            className="control control-leave"
            title="Sair da sala"
            onClick={session.leave}
          >
            <LeaveIcon />
          </button>
        </div>
      </footer>
    </div>
  );
}
