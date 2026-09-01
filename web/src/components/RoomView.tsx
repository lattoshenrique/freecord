import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import LiquidGlass from 'liquid-glass-react';
import { Link } from 'react-router-dom';
import type { RoomSummary } from '../api';
import { renderMarkdown } from '../lib/markdown';
import { playMessageChime } from '../lib/notification-sound';
import { SCREEN_QUALITY_PRESETS, type ScreenQualityId } from '../lib/screen-quality';
import type { ScreenStats } from '../lib/stats';
import { useRoomSession, type JoinOptions } from '../lib/use-room';
import ChatComposer from './ChatComposer';
import InviteButton from './InviteButton';
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

/** O que está realmente saindo/chegando — não o que foi pedido. */
function ScreenStatsBar({ stats }: { stats: ScreenStats }) {
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
  if (parts.length === 0 && stats.rttMs === null) {
    return null;
  }
  return (
    <span className="screen-stats">
      {stats.direction === 'sending' ? 'Enviando' : 'Recebendo'}
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

function QualityMenu({
  value,
  onChange,
  onClose,
}: {
  value: ScreenQualityId;
  onChange: (id: ScreenQualityId) => void;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" className="menu-backdrop" aria-label="Fechar menu" onClick={onClose} />
      <div className="quality-menu" role="menu">
        <p className="quality-menu-title">Qualidade da tela</p>
        {SCREEN_QUALITY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="menuitemradio"
            aria-checked={preset.id === value}
            className={`quality-option ${preset.id === value ? 'selected' : ''}`}
            onClick={() => {
              onChange(preset.id);
              onClose();
            }}
          >
            <span className="quality-option-label">{preset.label}</span>
            <span className="quality-option-hint">{preset.hint}</span>
          </button>
        ))}
        <p className="quality-menu-note">
          Vale na hora, mesmo compartilhando. A tela é distribuída em árvore: cada pessoa envia
          no máximo 3 cópias, então o teto não cai com o tamanho da sala.
        </p>
      </div>
    </>
  );
}

/**
 * Contador de mensagens não lidas, ancorado acima do botão de chat.
 *
 * Fica FORA do dock de vidro: a lib corta overflow e impõe fonte própria aos
 * filhos. A posição horizontal é medida a partir do botão, para o chip apontar
 * para ele e não para o meio do rodapé.
 */
function ChatUnreadChip({
  count,
  left,
  onOpen,
}: {
  count: number;
  left: number | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="chat-unread-chip"
      style={left === null ? undefined : { left }}
      onClick={onOpen}
    >
      <span className="chat-unread-count">{count > 99 ? '99+' : count}</span>
      {count === 1 ? 'nova mensagem' : 'novas mensagens'}
    </button>
  );
}

function MediaView({
  stream,
  muted,
  className,
  videoRef,
}: {
  stream: MediaStream;
  muted: boolean;
  className?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? ownRef;
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

/* Prefixos WebKit: Safari (desktop e iOS) ainda não usa a API padrão. */
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
 * Tela cheia do palco de compartilhamento.
 *
 * Vai a tela cheia o CONTÊINER, não o <video>: assim os rótulos (quem
 * compartilha, estatísticas) e o próprio botão continuam por cima da imagem.
 * No Safari do iPhone, onde só <video> entra em tela cheia, cai para o
 * webkitEnterFullscreen do vídeo — aí quem manda é o player nativo.
 */
function useFullscreen(
  containerRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const [active, setActive] = useState(() => fullscreenElement() !== null);

  // Sai por Esc, pelo botão do navegador ou porque o elemento sumiu (a
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
  latencyMs,
  latencyTitle,
  style,
}: {
  name: string;
  isSelf: boolean;
  micOff: boolean;
  stream: MediaStream | null;
  latencyMs: number | null;
  latencyTitle: string;
  style?: React.CSSProperties;
}) {
  const showVideo = stream !== null && hasLiveVideo(stream);
  return (
    <div className="tile" style={style}>
      <LatencyChip ms={latencyMs} title={latencyTitle} />
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
  const [qualityOpen, setQualityOpen] = useState(false);
  const [chipLeft, setChipLeft] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);

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

  // Aviso sonoro: só do que veio de outra pessoa, com o chat aberto ou não.
  const soundedCountRef = useRef(0);
  const { chat, selfId } = session;
  useEffect(() => {
    const fresh = chat.slice(soundedCountRef.current);
    soundedCountRef.current = chat.length;
    if (fresh.some((message) => message.from.id !== selfId)) {
      playMessageChime();
    }
  }, [chat, selfId]);

  // O chip aponta para o botão de chat, que se move conforme o dock muda de
  // largura (botão de tela desabilitado, telas estreitas) — daí a medição.
  useLayoutEffect(() => {
    if (chatOpen || unread === 0) {
      return;
    }
    const measure = () => {
      const button = chatButtonRef.current?.getBoundingClientRect();
      const footer = footerRef.current?.getBoundingClientRect();
      if (button && footer) {
        setChipLeft(button.left - footer.left + button.width / 2);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [chatOpen, unread]);

  const stageRef = useRef<HTMLDivElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const fullscreen = useFullscreen(stageRef, screenVideoRef);

  // Computado a cada render de propósito: streams remotos chegam por
  // notificação do mesh (re-render sem mudança de estado React) — um
  // useMemo aqui devolveria o valor cacheado e nunca veria o stream.
  // Na árvore de retransmissão a tela chega do PAI (screenSource), que
  // pode ser um relay e não quem compartilha.
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
  // Recebendo por um relay da árvore: o RTT exibido é até ele, não até a origem.
  const relayName =
    someoneElseSharing && session.screenSource && session.screenSource.id !== session.screen?.id
      ? (session.peers.find((p) => p.id === session.screenSource?.id)?.name ?? 'relay')
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
                title={fullscreen.active ? 'Sair da tela cheia' : 'Ver em tela cheia'}
                aria-label={fullscreen.active ? 'Sair da tela cheia' : 'Ver em tela cheia'}
                onClick={fullscreen.toggle}
              >
                {fullscreen.active ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </button>
              <div className="screen-overlay">
                <span className="screen-label">
                  {sharerName ? `Tela de ${sharerName}` : 'Sua tela'}
                  {relayName && <span className="screen-relay-hint"> · via {relayName}</span>}
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
              stream={session.localMedia && session.camOn ? session.localMedia : null}
              latencyMs={session.signalRttMs}
              latencyTitle="Latência até o servidor de sinalização"
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
                  stream={cameraStream}
                  latencyMs={session.peerLatency.get(peer.id)?.rttMs ?? null}
                  latencyTitle={`Latência direta com ${peer.name}`}
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
                    <div className="chat-md">{renderMarkdown(message.text)}</div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <ChatComposer
              value={draft}
              maxLength={500}
              onChange={setDraft}
              onSend={() => {
                const text = draft.trim();
                if (text) {
                  session.sendChat(text);
                  setDraft('');
                }
              }}
            />
          </aside>
        )}
      </div>

      <footer className="room-footer" ref={footerRef}>
        {!chatOpen && unread > 0 && !qualityOpen && (
          <ChatUnreadChip count={unread} left={chipLeft} onOpen={() => setChatOpen(true)} />
        )}
        {qualityOpen && (
          <QualityMenu
            value={session.screenQuality}
            onChange={session.setScreenQuality}
            onClose={() => setQualityOpen(false)}
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
            className={`control ${qualityOpen ? 'control-active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={qualityOpen}
            title="Qualidade do compartilhamento de tela"
            onClick={() => setQualityOpen((open) => !open)}
          >
            <SlidersIcon />
          </button>
          <button
            ref={chatButtonRef}
            type="button"
            className={`control ${chatOpen ? 'control-active' : ''}`}
            aria-pressed={chatOpen}
            title={chatOpen ? 'Fechar chat' : 'Abrir chat'}
            onClick={() => setChatOpen((open) => !open)}
          >
            <ChatIcon />
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
        </LiquidGlass>
      </footer>
    </div>
  );
}
