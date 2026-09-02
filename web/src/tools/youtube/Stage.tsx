/**
 * The shared player on the room's stage.
 *
 * Everyone runs their own YouTube player and the room agrees on what is
 * on, whether it is playing, where it is, and what comes next. The rule
 * that keeps that agreement honest is the whole of this file:
 *
 *   a PERSON moving the player tells the room (setState);
 *   a PLAYER falling behind fixes itself (seek, silently).
 *
 * Confusing the two is what makes watch-together features fight: a
 * viewer on a slow link reports its own buffering as a seek and drags
 * everyone backwards, one tick at a time. So the sampler compares each
 * tick against how much wall-clock time actually passed — a player that
 * stalls drifts by less than a second per tick, while a person dragging
 * the bar jumps — and a player that has not yet arrived where the room is
 * says nothing about position at all (sync.ts).
 *
 * Two things move the room on by themselves, and both are reported by
 * whoever sees them first: a video ending (the queue advances) and a
 * playlist walking to its next video (the room follows the index). Both
 * are idempotent, and both are refused by a straggler whose item is no
 * longer the room's (queue.ts).
 *
 * While we are the ones applying the room's state, sampling is suspended:
 * seekTo and playVideo fire the same events a person would.
 */
import { useEffect, useRef, useState } from 'react';
import type { ToolViewProps } from '../contract';
import { CloseGlyph, SkipGlyph } from './icons';
import { PLAYER_STATE, createPlayer, type YouTubePlayer } from './player';
import { advance, mayAdvanceFrom, withListIndex } from './queue';
import { positionAt, type WatchItem, type WatchState } from './state';
import { DRIFT_TOLERANCE_SECONDS, decideSync } from './sync';
import './stage.css';

/**
 * How often the player is read. Short enough that a stall never looks
 * like a jump (see sync.ts), long enough to cost nothing.
 */
const SAMPLE_INTERVAL_MS = 1000;
/** How long our own applying is left alone by the sampler. */
const APPLY_QUIET_MS = 1200;
/**
 * A player told to go somewhere gets this long to arrive before we ask
 * again. Long enough for a slow start on a slow link; short enough that a
 * load which silently failed is retried while anybody still cares.
 */
const SETTLE_TIMEOUT_MS = 10_000;

/**
 * What the player has to be told to load. A playlist's INDEX is not part
 * of it: walking to another of its videos is a jump inside the thing that
 * is already loaded, and reloading it there would start it over.
 */
function loadKeyOf(item: WatchItem): string {
  return item.kind === 'video' ? `video:${item.video}` : `list:${item.list}`;
}

/**
 * Nothing on, nothing on stage. The player below is mounted only with a
 * state in hand, so it never has to ask whether there is one.
 */
export default function Stage(props: ToolViewProps<WatchState>) {
  // Already through parseState by the time it reaches a view (the shelf
  // does it): all that is left is whether there is one.
  return props.state ? <Player {...props} state={props.state} /> : null;
}

function Player({
  state,
  at,
  mine,
  setState,
  speakerOn,
  t,
}: ToolViewProps<WatchState> & { state: WatchState }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [blocked, setBlocked] = useState(false);

  // Read by callbacks that outlive a render (the sampler, the player's
  // own events), so they always see the room's latest word.
  const roomRef = useRef({ state, at });
  roomRef.current = { state, at };
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const speakerRef = useRef(speakerOn);
  speakerRef.current = speakerOn;
  const mineRef = useRef(mine);
  mineRef.current = mine;

  /** What the player has loaded — not necessarily the room's, yet. */
  const loadedRef = useRef(loadKeyOf(state.now));
  /** Sampling is suspended until this moment (see APPLY_QUIET_MS). */
  const quietUntilRef = useRef(0);
  /**
   * We have told this player where to go and it has not arrived (sync.ts).
   * True from the first frame: a video asked to start at 9:30 reads as
   * 0:00 while it loads, and reporting that is how a joiner drags a whole
   * room back to the start of a film.
   */
  const settlingRef = useRef(true);
  /** When to stop waiting for it and ask again. */
  const settleDeadlineRef = useRef(Date.now() + SETTLE_TIMEOUT_MS);
  /** The previous sample, against which a jump is a jump. */
  const sampleRef = useRef({ time: state.time, at: Date.now(), playing: state.playing });

  /**
   * Called for everything WE do to the player: the sampler leaves it
   * alone for a moment (its own seeks fire the events a person's would),
   * and the player counts as on its way until it arrives.
   */
  function quiet(from: { time: number; playing: boolean }): void {
    const now = Date.now();
    quietUntilRef.current = now + APPLY_QUIET_MS;
    settlingRef.current = true;
    settleDeadlineRef.current = now + SETTLE_TIMEOUT_MS;
    // The baseline moves with what we just did, or the correction itself
    // would read as a jump on the next tick.
    sampleRef.current = { time: from.time, at: now, playing: from.playing };
  }

  /** Brings this player to whatever the room last said. */
  function applyRoom(): void {
    const player = playerRef.current;
    const room = roomRef.current;
    if (!player) {
      return; // still loading; it is built on the room's state anyway
    }
    const item = room.state.now;
    const target = positionAt(room.state, room.at);
    if (loadKeyOf(item) !== loadedRef.current) {
      loadedRef.current = loadKeyOf(item);
      setBlocked(false);
      quiet({ time: target, playing: room.state.playing });
      if (item.kind === 'video') {
        const load = room.state.playing ? player.loadVideoById : player.cueVideoById;
        load.call(player, { videoId: item.video, startSeconds: target });
      } else {
        const load = room.state.playing ? player.loadPlaylist : player.cuePlaylist;
        load.call(player, {
          list: item.list,
          listType: 'playlist',
          index: item.index,
          startSeconds: target,
        });
      }
      return;
    }
    if (item.kind === 'list' && player.getPlaylistIndex() !== item.index) {
      // The room is on another of this playlist's videos: a jump inside
      // what is already loaded, never a reload.
      quiet({ time: target, playing: room.state.playing });
      player.playVideoAt(item.index);
      return;
    }
    if (mineRef.current) {
      // We are the ones who moved it: the player is already there, and a
      // round trip's worth of correction would jump it under our hands.
      return;
    }
    const playerState = player.getPlayerState();
    const playing = playerState === PLAYER_STATE.playing || playerState === PLAYER_STATE.buffering;
    if (Math.abs(player.getCurrentTime() - target) > DRIFT_TOLERANCE_SECONDS) {
      player.seekTo(target, true);
    }
    if (room.state.playing !== playing) {
      if (room.state.playing) {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    }
    quiet({ time: target, playing: room.state.playing });
  }

  /** Whether this player's playlist has nothing after the video that just ended. */
  function atEndOfList(player: YouTubePlayer): boolean {
    try {
      const list = player.getPlaylist();
      const index = player.getPlaylistIndex();
      return !list || list.length === 0 || index < 0 || index >= list.length - 1;
    } catch {
      return true;
    }
  }

  /**
   * One reading of our player against the room's state — the rules at the
   * top of this file, in code.
   */
  function sample(): void {
    const player = playerRef.current;
    const room = roomRef.current;
    if (!player || Date.now() < quietUntilRef.current) {
      return;
    }
    let time: number;
    let playerState: number;
    try {
      time = player.getCurrentTime();
      playerState = player.getPlayerState();
    } catch {
      return; // the iframe is going away under us
    }
    const item = room.state.now;

    // A playlist walked to its next video on its own: the room follows
    // whoever noticed first, and the ones that notice a second later send
    // the same thing.
    if (item.kind === 'list') {
      let index = -1;
      try {
        index = player.getPlaylistIndex();
      } catch {
        index = -1;
      }
      if (index >= 0 && index !== item.index) {
        settlingRef.current = false;
        setStateRef.current(withListIndex(room.state, index));
        return;
      }
    }

    if (playerState === PLAYER_STATE.ended) {
      // The end of a video, or of a whole playlist: the queue moves on.
      // A straggler that gets here late finds the room already moved on
      // and says nothing (queue.ts).
      if (mayAdvanceFrom(room.state, item) && (item.kind === 'video' || atEndOfList(player))) {
        settlingRef.current = false;
        setStateRef.current(advance(room.state));
      }
      return;
    }

    if (playerState === PLAYER_STATE.unstarted || playerState === PLAYER_STATE.cued) {
      // Not started: something still getting ready, or an autoplay the
      // browser refused. Nobody paused anything — so nothing is reported;
      // we ask our own player again and, if the browser keeps saying no,
      // its play button is right there.
      if (room.state.playing) {
        player.playVideo();
        quiet({ time: positionAt(room.state, room.at), playing: true });
      }
      return;
    }

    const now = Date.now();
    const previous = sampleRef.current;
    // Buffering is still "playing" to the room: the video is on, this
    // viewer's copy is merely catching up.
    const playing = playerState === PLAYER_STATE.playing || playerState === PLAYER_STATE.buffering;
    const current = { time, at: now, playing };
    sampleRef.current = current;
    const target = positionAt(room.state, room.at, now);
    const action = decideSync(
      previous,
      current,
      { playing: room.state.playing, time: target },
      settlingRef.current,
    );
    if (action.kind === 'wait') {
      // Still on our way. If it is taking too long, the load or the seek
      // did not take: ask again rather than wait forever on a player that
      // stopped listening.
      if (now > settleDeadlineRef.current) {
        try {
          player.seekTo(target, true);
          quiet({ time: target, playing: room.state.playing });
        } catch {
          // nothing to fix if the player is gone
        }
      }
      return;
    }
    // Anything else means we are where the room is: our position counts
    // again, for good or ill.
    settlingRef.current = false;
    if (action.kind === 'report') {
      setStateRef.current({ ...room.state, playing: action.playing, time: action.time });
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
    const room = roomRef.current;
    quiet({ time: positionAt(room.state, room.at), playing: room.state.playing });

    void createPlayer(mount, {
      item: room.state.now,
      startSeconds: positionAt(room.state, room.at),
      autoplay: room.state.playing,
      onReady: (player) => {
        if (cancelled) {
          player.destroy();
          return;
        }
        playerRef.current = player;
        if (!speakerRef.current) {
          player.mute();
        }
        // The room may have moved on while the API was loading.
        applyRoom();
      },
      onStateChange: () => sample(),
      // Something that cannot be played here (removed, private, embedding
      // off) is not a broken room: say so, and the keys to move on or to
      // close it are right there.
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
    // Mounted once per stage: a change of what is on is applied to the
    // player that is already here, never by building a second one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The room said something.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(applyRoom, [state, at]);

  // Speakers off silences the video too — a room you cannot hear is a
  // room you cannot hear.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    if (speakerOn) {
      player.unMute();
    } else {
      player.mute();
    }
  }, [speakerOn]);

  const queued = state.queue.length;

  return (
    <div className="screen-stage youtube-stage fade-in">
      {/*
        A strip of our own above the player instead of chips floating over
        it: YouTube's chrome owns all four corners of that frame, and our
        close key kept landing on its settings gear.
      */}
      <div className="youtube-bar">
        <span className="youtube-title">
          {t('stageLabel')}
          {queued > 0 && <span className="youtube-queued">{t('queued', { count: queued })}</span>}
        </span>
        <span className="youtube-keys">
          {queued > 0 && (
            <button
              type="button"
              className="youtube-key"
              aria-label={t('skip')}
              title={t('skip')}
              onClick={() => setState(advance(state))}
            >
              <SkipGlyph />
            </button>
          )}
          <button
            type="button"
            className="youtube-key youtube-close"
            aria-label={t('closeForAll')}
            title={t('closeForAll')}
            onClick={() => setState(null)}
          >
            <CloseGlyph />
          </button>
        </span>
      </div>
      <div className="youtube-frame" ref={hostRef} />
      {blocked && (
        <div className="youtube-blocked" role="status">
          <p>{t('blocked')}</p>
          <span className="youtube-blocked-keys">
            {state.now.kind === 'video' && (
              <a
                className="youtube-blocked-link"
                href={`https://www.youtube.com/watch?v=${state.now.video}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('openOnYouTube')}
              </a>
            )}
            {queued > 0 && (
              <button type="button" className="tool-open" onClick={() => setState(advance(state))}>
                {t('skip')}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
