/**
 * The shared source on the room's stage.
 *
 * Three players live here, and they differ in exactly one thing: how
 * much of the room's agreement they can actually keep.
 *
 *   media   our own <video>. The room agrees on playing and on a
 *           position, and the rule from sync.ts keeps it honest — a
 *           PERSON moving the player tells the room, a PLAYER falling
 *           behind fixes itself, and the two are told apart by whether
 *           we were the ones who moved it a moment ago.
 *   twitch  their player, through their API. Play and pause for
 *           everybody, and the volume obeys the room's speaker key. A
 *           broadcast has no position to agree on: the agreement is the
 *           live edge.
 *   frame   somebody else's page. We can put the same thing in front of
 *           everybody and nothing else — no clock, no volume, no way in.
 *           The stage says so instead of pretending, because a viewer
 *           who thinks the room is synchronised and is not will blame
 *           the room.
 *
 * Whatever plays, it plays from wherever it lives, straight to this
 * browser. Nothing is proxied and nothing is stored.
 */
import { useEffect, useRef, useState } from 'react';
import type { ToolViewProps } from '../contract';
import { CloseGlyph, HandGlyph } from './icons';
import { hostOf } from './local';
import { attachSource, liveEdgeOf, type SourceFailure } from './player';
import { hasSharedClock, isFramableHere, positionAt, type VideoState } from './state';
import { correctionFor, liveCorrectionFor } from './sync';
import { mountTwitch, seekString, type TwitchPlayer } from './twitch';
import './stage.css';

/** How often a player is read against the room. */
const TICK_MS = 1000;
/**
 * How long our own corrections are left alone. Anything we do to a
 * player fires the same events a person's hand would, and a correction
 * reported back as a move is how a room starts arguing with itself.
 */
const QUIET_MS = 1200;

export default function Stage(props: ToolViewProps<VideoState>) {
  return props.state ? <Source {...props} state={props.state} /> : null;
}

function Source(props: ToolViewProps<VideoState> & { state: VideoState }) {
  const { state, setState, t } = props;
  const [failure, setFailure] = useState<SourceFailure | null>(null);
  const framable = state.play !== 'frame' || isFramableHere(state.url, window.location.origin);

  return (
    <div className="screen-stage video-stage fade-in">
      {/*
        A strip of our own above the player rather than chips floating
        over it: a stranger's page owns all four corners of that frame,
        and our close key would land on whatever they put there.
      */}
      <div className="video-bar">
        <span className="video-title">{state.title ?? t('stageLabel')}</span>
        {!hasSharedClock(state) && (
          <span className="video-chip">
            <HandGlyph />
            {t('ownClock')}
          </span>
        )}
        <button
          type="button"
          className="video-close"
          aria-label={t('closeForAll')}
          title={t('closeForAll')}
          onClick={() => setState(null)}
        >
          <CloseGlyph />
        </button>
      </div>

      <div className="video-frame">
        {failure || !framable ? null : state.play === 'frame' ? (
          <FramedPage state={state} t={t} />
        ) : state.play === 'twitch' ? (
          <TwitchSource {...props} state={state} onFailure={setFailure} />
        ) : (
          <MediaSource {...props} state={state} onFailure={setFailure} />
        )}
        {(failure || !framable) && (
          <div className="video-failed" role="status">
            <p>{t(failure === 'unsupported' ? 'noHls' : 'failed')}</p>
            <a
              className="video-failed-link"
              href={state.page ?? state.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('openOriginal')}
            </a>
          </div>
        )}
      </div>

      {state.play === 'frame' && !failure && framable && (
        <p className="video-note">{t('frameNote')}</p>
      )}
    </div>
  );
}

/**
 * Somebody else's page, sandboxed.
 *
 * `allow-scripts allow-same-origin` is what makes a player work at all,
 * and it is safe only because the document is cross-origin — which is
 * checked before this renders (state.ts). What is deliberately NOT
 * granted: top-level navigation, so an ad script cannot steer the room
 * away from the call, and popups, so it cannot open one behind it.
 *
 * This is also the kind that carries the sites whose player is only
 * built after a click: each person clicks in their own frame, with their
 * own session, which is exactly what a link signed for one viewer needs.
 */
function FramedPage({ state, t }: { state: VideoState; t: ToolViewProps<VideoState>['t'] }) {
  return (
    <iframe
      className="video-embed"
      src={state.url}
      title={state.title ?? t('stageLabel')}
      sandbox="allow-scripts allow-same-origin allow-forms"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
}

function MediaSource({
  state,
  at,
  mine,
  setState,
  speakerOn,
  onFailure,
}: ToolViewProps<VideoState> & { state: VideoState; onFailure: (failure: SourceFailure) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef({ state, at });
  roomRef.current = { state, at };
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  /** Sampling and reporting are suspended until this moment. */
  const quietUntil = useRef(0);

  function quiet(): void {
    quietUntil.current = Date.now() + QUIET_MS;
  }

  /** Anything a person does to the player is news for the room. */
  function report(): void {
    const video = videoRef.current;
    if (!video || Date.now() < quietUntil.current) {
      return;
    }
    const room = roomRef.current.state;
    setStateRef.current({
      ...room,
      playing: !video.paused,
      // A broadcast has no position worth carrying, and writing one
      // would send every viewer chasing a number that means nothing.
      time: room.live ? 0 : video.currentTime,
    });
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    let attached: { destroy(): void } | null = null;
    let cancelled = false;
    const room = roomRef.current;
    quiet();
    video.muted = !speakerOn;
    void attachSource(video, room.state, onFailure).then((source) => {
      if (cancelled) {
        source.destroy();
        return;
      }
      attached = source;
      if (!room.state.live) {
        video.currentTime = positionAt(room.state, room.at);
      }
      if (room.state.playing) {
        // A browser that refuses to autoplay is not an error: the
        // element keeps its controls and whoever is watching presses
        // play. What must not happen is telling the room it was paused.
        video.play().catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
      attached?.destroy();
    };
    // Rebuilt when the room changes source, never on a position change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.url, state.play]);

  // The room said something: bring this player to it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mineRef.current) {
      // We are the ones who moved it: it is already there, and a round
      // trip's worth of correction would jump it under our own hands.
      return;
    }
    quiet();
    if (state.playing && video.paused) {
      video.play().catch(() => undefined);
    } else if (!state.playing && !video.paused) {
      video.pause();
    }
    if (hasSharedClock(state)) {
      const target = positionAt(state, at);
      if (Math.abs(video.currentTime - target) > 2) {
        video.currentTime = target;
      }
    }
  }, [state, at]);

  // And the ticker, for the drift nobody announced.
  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || Date.now() < quietUntil.current) {
        return;
      }
      const room = roomRef.current;
      const reading = {
        time: video.currentTime,
        paused: video.paused,
        // HAVE_FUTURE_DATA: below this it cannot say where it is, and a
        // player on its way somewhere is not evidence of anything.
        busy: video.seeking || video.readyState < 3,
        liveEdge: liveEdgeOf(video),
      };
      const correction = room.state.live
        ? liveCorrectionFor(reading, room.state)
        : correctionFor(reading, { playing: room.state.playing, time: positionAt(room.state, room.at) });
      if (correction.kind === 'idle') {
        return;
      }
      quiet();
      if (correction.kind === 'play') {
        video.play().catch(() => undefined);
      } else if (correction.kind === 'pause') {
        video.pause();
      } else {
        video.currentTime = correction.time;
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Speakers off silences this too — a room you cannot hear is a room
  // you cannot hear.
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !speakerOn;
    }
  }, [speakerOn]);

  return (
    <video
      ref={videoRef}
      className="video-media"
      controls
      playsInline
      poster={undefined}
      onPlay={report}
      onPause={report}
      onSeeked={report}
    />
  );
}

function TwitchSource({
  state,
  at,
  mine,
  setState,
  speakerOn,
  onFailure,
}: ToolViewProps<VideoState> & { state: VideoState; onFailure: (failure: SourceFailure) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwitchPlayer | null>(null);
  const roomRef = useRef({ state, at });
  roomRef.current = { state, at };
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const speakerRef = useRef(speakerOn);
  speakerRef.current = speakerOn;
  const quietUntil = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let cancelled = false;
    // Their embed replaces the element it is given, so it gets a node of
    // its own rather than the one React is holding.
    const mount = document.createElement('div');
    mount.className = 'video-twitch-mount';
    host.appendChild(mount);
    const room = roomRef.current;
    quietUntil.current = Date.now() + QUIET_MS;

    void mountTwitch(mount, {
      channel: room.state.twitch?.channel,
      video: room.state.twitch?.video ?? room.state.twitch?.clip,
      autoplay: room.state.playing,
      muted: !speakerRef.current,
      startSeconds: positionAt(room.state, room.at),
      onReady: (player) => {
        if (cancelled) {
          return;
        }
        playerRef.current = player;
        player.setMuted(!speakerRef.current);
      },
      onPlayPause: () => {
        const player = playerRef.current;
        if (!player || Date.now() < quietUntil.current) {
          return;
        }
        const current = roomRef.current.state;
        setStateRef.current({
          ...current,
          playing: !player.isPaused(),
          time: current.live ? 0 : player.getCurrentTime(),
        });
      },
    }).catch(() => onFailure('failed'));

    return () => {
      cancelled = true;
      playerRef.current = null;
      mount.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.url]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || mine) {
      return;
    }
    quietUntil.current = Date.now() + QUIET_MS;
    if (state.playing && player.isPaused()) {
      player.play();
    } else if (!state.playing && !player.isPaused()) {
      player.pause();
    }
    if (hasSharedClock(state)) {
      const target = positionAt(state, at);
      if (Math.abs(player.getCurrentTime() - target) > 2) {
        player.seek(target);
      }
    }
  }, [state, at, mine]);

  useEffect(() => {
    playerRef.current?.setMuted(!speakerOn);
  }, [speakerOn]);

  return <div className="video-twitch" ref={hostRef} data-start={seekString(state.time)} />;
}

/** The host a stage shows when it has nothing better to call a source. */
export function stageHost(state: VideoState): string {
  return hostOf(state.page ?? state.url);
}
