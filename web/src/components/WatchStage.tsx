/**
 * The shared player on the room's stage.
 *
 * Everyone runs their own YouTube player and the room agrees on three
 * things: which video, playing or not, and where. The rule that keeps
 * that agreement honest is the whole of this file:
 *
 *   a PERSON moving the player tells the room (onChange);
 *   a PLAYER falling behind fixes itself (seek, silently).
 *
 * Confusing the two is what makes watch-together features fight: a
 * viewer on a slow link reports its own buffering as a seek and drags
 * everyone backwards, one tick at a time. So the sampler compares each
 * tick against how much wall-clock time actually passed — a player that
 * stalls drifts by less than a second per tick, while a person dragging
 * the bar jumps. Only a jump, or a play/pause that contradicts the room,
 * is reported.
 *
 * While we are the ones applying the room's state, sampling is suspended:
 * seekTo and playVideo fire the same events a person would.
 */
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { watchPosition, type WatchRoom } from '../lib/use-room';
import { DRIFT_TOLERANCE_SECONDS, decideSync } from '../lib/watch-sync';
import { PLAYER_STATE, createPlayer, type YouTubePlayer } from '../lib/youtube';
import { CloseIcon } from './icons';
import './watch-stage.css';

/**
 * How often the player is read. Short enough that a stall never looks
 * like a jump (see lib/watch-sync.ts), long enough to cost nothing.
 */
const SAMPLE_INTERVAL_MS = 1000;
/** How long our own applying is left alone by the sampler. */
const APPLY_QUIET_MS = 1200;

export default function WatchStage({
  watch,
  muted,
  onChange,
  onClose,
}: {
  watch: WatchRoom;
  /** Speakers off: the video goes quiet like everything else in the room. */
  muted: boolean;
  onChange: (video: string, playing: boolean, time: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [blocked, setBlocked] = useState(false);

  // Read by callbacks that outlive a render (the sampler, the player's
  // own events), so they always see the room's latest word.
  const roomRef = useRef(watch);
  roomRef.current = watch;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  /** The video the player has loaded — not necessarily the room's, yet. */
  const loadedRef = useRef(watch.video);
  /** Sampling is suspended until this moment (see APPLY_QUIET_MS). */
  const quietUntilRef = useRef(0);
  /** The previous sample, against which a jump is a jump. */
  const sampleRef = useRef({ time: watch.time, at: Date.now(), playing: watch.playing });

  function quiet(from: { time: number; playing: boolean }): void {
    quietUntilRef.current = Date.now() + APPLY_QUIET_MS;
    // The baseline moves with what we just did, or the correction itself
    // would read as a jump on the next tick.
    sampleRef.current = { time: from.time, at: Date.now(), playing: from.playing };
  }

  /** Brings this player to whatever the room last said. */
  function applyRoom(): void {
    const player = playerRef.current;
    const room = roomRef.current;
    if (!player) {
      return; // still loading; it is built on the room's state anyway
    }
    const target = watchPosition(room);
    if (room.video !== loadedRef.current) {
      loadedRef.current = room.video;
      setBlocked(false);
      quiet({ time: target, playing: room.playing });
      if (room.playing) {
        player.loadVideoById({ videoId: room.video, startSeconds: target });
      } else {
        player.cueVideoById({ videoId: room.video, startSeconds: target });
      }
      return;
    }
    if (room.mine) {
      // We are the ones who moved it: the player is already there, and a
      // round trip's worth of correction would jump it under our hands.
      return;
    }
    const state = player.getPlayerState();
    const playing = state === PLAYER_STATE.playing || state === PLAYER_STATE.buffering;
    if (Math.abs(player.getCurrentTime() - target) > DRIFT_TOLERANCE_SECONDS) {
      player.seekTo(target, true);
    }
    if (room.playing !== playing) {
      if (room.playing) {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    }
    quiet({ time: target, playing: room.playing });
  }

  /**
   * One reading of our player against the room's state — the rule at the
   * top of this file, in code.
   */
  function sample(): void {
    const player = playerRef.current;
    const room = roomRef.current;
    if (!player || Date.now() < quietUntilRef.current) {
      return;
    }
    let time: number;
    let state: number;
    try {
      time = player.getCurrentTime();
      state = player.getPlayerState();
    } catch {
      return; // the iframe is going away under us
    }
    if (state === PLAYER_STATE.unstarted || state === PLAYER_STATE.cued) {
      // Not started: a video still getting ready, or an autoplay the
      // browser refused. Nobody paused anything — so nothing is reported;
      // we ask our own player again and, if the browser keeps saying no,
      // its play button is right there.
      if (room.playing) {
        player.playVideo();
        quiet({ time: watchPosition(room), playing: true });
      }
      return;
    }
    const now = Date.now();
    const previous = sampleRef.current;
    // Buffering is still "playing" to the room: the video is on, this
    // viewer's copy is merely catching up.
    const playing = state === PLAYER_STATE.playing || state === PLAYER_STATE.buffering;
    const current = { time, at: now, playing };
    sampleRef.current = current;
    const action = decideSync(previous, current, {
      playing: room.playing,
      time: watchPosition(room, now),
    });
    if (action.kind === 'report') {
      onChangeRef.current(room.video, action.playing, action.time);
      return;
    }
    if (action.kind === 'seek') {
      try {
        player.seekTo(action.time, true);
        quiet({ time: action.time, playing: true });
      } catch {
        // same as above: nothing to fix if the player is gone
      }
    }
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    let cancelled = false;
    // YouTube replaces the element it is given with its iframe, so it gets
    // a node of its own rather than the one React is holding.
    const mount = document.createElement('div');
    host.appendChild(mount);
    const state = roomRef.current;
    quiet({ time: watchPosition(state), playing: state.playing });

    void createPlayer(mount, {
      videoId: state.video,
      startSeconds: watchPosition(state),
      autoplay: state.playing,
      onReady: (player) => {
        if (cancelled) {
          player.destroy();
          return;
        }
        playerRef.current = player;
        if (mutedRef.current) {
          player.mute();
        }
        // The room may have moved on while the API was loading.
        applyRoom();
      },
      onStateChange: () => sample(),
      // A video that cannot be played here (removed, private, embedding
      // off) is not a broken room: say so, and the shelf's close key is
      // there for whoever wants to move on.
      onError: () => setBlocked(true),
    }).catch(() => setBlocked(true));

    const timer = setInterval(sample, SAMPLE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
      mount.remove();
    };
    // Mounted once per stage: a change of video is applied to the player
    // that is already here, never by building a second one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The room said something.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(applyRoom, [watch]);

  // Speakers off silences the video too — a room you cannot hear is a
  // room you cannot hear.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    if (muted) {
      player.mute();
    } else {
      player.unMute();
    }
  }, [muted]);

  return (
    <div className="screen-stage watch-stage fade-in">
      {/*
        A strip of our own above the player instead of chips floating over
        it: YouTube's chrome owns all four corners of that frame, and our
        close key kept landing on its settings gear.
      */}
      <div className="watch-bar">
        <span className="watch-title">{t('watch.stageLabel')}</span>
        <button
          type="button"
          className="watch-close"
          aria-label={t('watch.closeForAll')}
          title={t('watch.closeForAll')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="watch-frame" ref={hostRef} />
      {blocked && (
        <div className="watch-blocked" role="status">
          <p>{t('watch.blocked')}</p>
          <a
            className="watch-blocked-link"
            href={`https://www.youtube.com/watch?v=${watch.video}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('watch.openOnYouTube')}
          </a>
        </div>
      )}
    </div>
  );
}
