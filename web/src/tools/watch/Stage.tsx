/**
 * The shared player on the room's stage.
 *
 * Everyone runs their own player and the room agrees on what is on,
 * whether it is playing, where it is, and what comes next. The rule that
 * keeps that agreement honest is the whole of this file:
 *
 *   a PERSON moving the player tells the room (setState);
 *   a PLAYER falling behind fixes itself (seek, silently).
 *
 * Confusing the two is what makes watch-together features fight: a viewer
 * on a slow link reports its own buffering as a seek and drags everyone
 * backwards, one tick at a time. How the two are told apart depends on
 * which player is on, and there are four of them here — they differ in
 * exactly one thing, which is how much of the room's agreement they can
 * actually keep:
 *
 *   YouTube   their iframe, driven through their API. A shared position,
 *             inferred from a number sampled once a second (sync.ts), and
 *             a queue that also follows a playlist walking on its own.
 *   media     our own <video>. A shared position too, and an easier one:
 *             an element SAYS when it is seeking or starving, so nothing
 *             has to be inferred.
 *   twitch    their player, through their API. Play and pause for
 *             everybody, and the volume obeys the room's speaker key. A
 *             broadcast has no position to agree on: the agreement is the
 *             live edge.
 *   frame     somebody else's page. We can put the same thing in front of
 *             everybody and nothing else — no clock, no volume, no way
 *             in. The stage SAYS so instead of pretending, because a
 *             viewer who thinks the room is synchronised and is not will
 *             blame the room.
 *
 * `speakerLevel` — this viewer's own volume for the tool — degrades along
 * the same four steps, and for the same reason. Ours takes it exactly;
 * YouTube and Twitch each expose a volume of their own and take it on
 * their scale; the framed page takes nothing, which `frameNote` already
 * says out loud. It is never written into the room's state: it is one
 * person's opinion about how loud this is, not the room's.
 *
 * The strip above them is shared, and so is the queue behind them: what
 * ends — a video, an episode, a playlist reaching its last entry — hands
 * the stage to whatever is next, whatever kind of thing that is. Both
 * moves are idempotent and both are refused by a straggler whose item is
 * no longer the room's (queue.ts).
 *
 * Whatever plays, it plays from wherever it lives, straight to this
 * browser. Nothing is proxied and nothing is stored.
 */
import { useEffect, useRef, useState } from 'react';
import type { ToolViewProps } from '../contract';
import { isWatchController, watchControllerName } from './control';
import { CloseGlyph, HandGlyph, PlayGlyph, SkipGlyph, SyncGlyph } from './icons';
import { twitchClipUrl } from './link';
import { attachSource, liveEdgeOf, type SourceFailure } from './media';
import { advance, mayAdvanceFrom, withListIndex } from './queue';
import {
  hasSharedClock,
  isFramableHere,
  isLive,
  positionAt,
  roomDrives,
  type WatchItem,
  type WatchState,
} from './state';
import {
  DRIFT_TOLERANCE_SECONDS,
  correctionFor,
  decideControllerSync,
  liveCorrectionFor,
  type PendingSeekReport,
} from './sync';
import { PLAYER_STATE, createPlayer, youtubeLiveEdgeOf, type YouTubePlayer } from './youtube';
import { mountTwitch, type TwitchPlayer } from './twitch';
import './stage.css';

/** How often a player is read against the room. */
const TICK_MS = 1000;
/**
 * How long our own applying is left alone by the sampler. Anything we do
 * to a player fires the same events a person's hand would, and a
 * correction reported back as a move is how a room starts arguing with
 * itself.
 */
const QUIET_MS = 1200;
/**
 * A player told to go somewhere gets this long to arrive before we ask
 * again. Long enough for a slow start on a slow link; short enough that a
 * load which silently failed is retried while anybody still cares.
 */
const SETTLE_TIMEOUT_MS = 10_000;
/** After this many refusals we stop asking and wait to be asked. */
const REFUSALS_BEFORE_GIVING_UP = 3;
/**
 * How long the room's copy is allowed to be behind the room before we say
 * so. A player takes a moment to start, and a key offered over every
 * ordinary load would be a key that means nothing.
 */
const STALL_GRACE_MS = 4_000;

/** What went wrong with what is on, in the words the stage has for it. */
type Trouble = 'blocked' | SourceFailure;

/** A YouTube item: the two kinds their player knows how to load. */
type YouTubeItem = Extract<WatchItem, { kind: 'video' } | { kind: 'list' }>;
/** Anything else: a file, a stream, Twitch, or a page. */
type SourceItem = Extract<WatchItem, { kind: 'source' }>;

/**
 * What the player has to be told to load. A playlist's INDEX is not part
 * of it: walking to another of its videos is a jump inside the thing that
 * is already loaded, and reloading it there would start it over.
 */
function loadKeyOf(item: WatchItem): string {
  if (item.kind === 'video') {
    return `video:${item.video}`;
  }
  return item.kind === 'list' ? `list:${item.list}` : `${item.play}:${item.url}`;
}

/**
 * Nothing on, nothing on stage. The players below are mounted only with a
 * state in hand, so they never have to ask whether there is one.
 */
export default function Stage(props: ToolViewProps<WatchState>) {
  // Already through parseState by the time it reaches a view (the shelf
  // does it): all that is left is whether there is one.
  return props.state ? <Together {...props} state={props.state} /> : null;
}

function Together(props: ToolViewProps<WatchState> & { state: WatchState }) {
  const { state, setState, t, by, self, peers } = props;
  const item = state.now;
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [resyncRequest, setResyncRequest] = useState(0);
  const canControl = isWatchController(by, self);
  const controllerName = watchControllerName(by, self, peers);
  /** Whether THIS browser's copy is running, whatever the room says. */
  const [playingHere, setPlayingHere] = useState(false);
  /**
   * The room is playing and this copy is not, for longer than a start
   * takes. Nearly always an autoplay the browser refused.
   *
   * A viewer had no way out of that, and never did: the player is inert
   * and its frame takes no pointer at all (stage.css), so the play button
   * everybody could see was never one anybody could press — it just took
   * hiding the rest of the chrome (youtube.ts) for the dead end to look
   * like one. So the room offers a key of its own, drawn outside the
   * inert frame, and pressing it is the gesture the browser was holding
   * out for. It starts THIS copy and tells nobody.
   */
  const [stalled, setStalled] = useState(false);

  // Trouble belongs to what caused it. Without this, one dead link turns
  // the stage into an error message that outlives it — the room puts on
  // something else and still reads "did not play here".
  useEffect(() => setTrouble(null), [loadKeyOf(item)]);

  // A fresh thing on the stage has not had its chance to start yet.
  useEffect(() => setPlayingHere(false), [loadKeyOf(item)]);

  useEffect(() => {
    if (playingHere || !state.playing || canControl) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALL_GRACE_MS);
    return () => clearTimeout(timer);
  }, [playingHere, state.playing, canControl]);

  const clipUrl = twitchClipUrl(item);
  const framed = item.kind === 'source' && (item.play === 'frame' || clipUrl !== null);
  const framable =
    item.kind !== 'source' || item.play !== 'frame' || isFramableHere(item.url, window.location.origin);
  const queued = state.queue.length;
  // A YouTube refusal fades OVER the player it interrupted; a source that
  // did not load has nothing worth leaving on screen.
  const hide = item.kind === 'source' && (trouble !== null || !framable);

  return (
    <div className="screen-stage watch-stage fade-in">
      {/*
        A strip of our own above the player instead of chips floating over
        it: a player's chrome owns all four corners of that frame, and our
        close key kept landing on somebody else's settings gear.
      */}
      <div className="watch-bar">
        <span className="watch-title">
          {(item.kind === 'source' && item.title) || t('stageLabel')}
          {queued > 0 && <span className="watch-queued">{t('queued', { count: queued })}</span>}
        </span>
        {/* Only what the room does NOT drive gets marked: a live channel
            still answers the room's play, pause and speaker key, and
            saying "each on their own" there was simply untrue. */}
        {!roomDrives(item) && (
          <span className="watch-chip">
            <HandGlyph />
            {t('ownClock')}
          </span>
        )}
        {!canControl && (
          <span className="watch-chip watch-controller-chip">
            {controllerName
              ? t('controllerChip', { name: controllerName })
              : t('controllerChipUnknown')}
          </span>
        )}
        <span className="watch-keys">
          {/* Local, and offered to everybody: it moves this copy to where
              the room already is, which is the one correction a viewer
              has always been allowed to make. Every player answers it. */}
          {roomDrives(item) && (
            <button
              type="button"
              className="watch-key watch-resync"
              aria-label={t('resync')}
              title={t('resync')}
              onClick={() => setResyncRequest((request) => request + 1)}
            >
              <SyncGlyph />
            </button>
          )}
          {canControl && queued > 0 && (
            <button
              type="button"
              className="watch-key"
              aria-label={t('skip')}
              title={t('skip')}
              onClick={() => setState(advance(state))}
            >
              <SkipGlyph />
            </button>
          )}
          {canControl && (
            <button
              type="button"
              className="watch-key watch-close"
              aria-label={t('closeForAll')}
              title={t('closeForAll')}
              onClick={() => setState(null)}
            >
              <CloseGlyph />
            </button>
          )}
        </span>
      </div>

      <div className="watch-frame">
        {hide ? null : item.kind !== 'source' ? (
          <YouTubeStage
            {...props}
            item={item}
            canControl={canControl}
            resyncRequest={resyncRequest}
            onPlayingHere={setPlayingHere}
            onTrouble={setTrouble}
          />
        ) : item.play === 'frame' ? (
          <FramedPage url={item.url} title={item.title ?? t('stageLabel')} />
        ) : clipUrl ? (
          /* A clip is not a channel and not a VOD: their player API does
             not take one, so it gets the frame their site gives out. */
          <FramedPage url={clipUrl} title={item.title ?? t('stageLabel')} />
        ) : item.play === 'twitch' ? (
          <TwitchSource
            {...props}
            item={item}
            canControl={canControl}
            resyncRequest={resyncRequest}
            onPlayingHere={setPlayingHere}
            onTrouble={setTrouble}
          />
        ) : (
          <MediaSource
            {...props}
            item={item}
            canControl={canControl}
            resyncRequest={resyncRequest}
            onPlayingHere={setPlayingHere}
            onTrouble={setTrouble}
          />
        )}
        {/* Only over a player the room actually drives. Somebody else's
            page is nobody's to start from here, and it says so already. */}
        {stalled && roomDrives(item) && !hide && !trouble && (
          <button
            type="button"
            className="watch-catchup"
            onClick={() => setResyncRequest((request) => request + 1)}
          >
            <span className="watch-catchup-key">
              <PlayGlyph />
            </span>
            <span className="watch-catchup-label">{t('catchUp')}</span>
            <span className="watch-catchup-note">{t('catchUpNote')}</span>
          </button>
        )}
        {(trouble || !framable) && (
          <div className="watch-trouble" role="status">
            <p>{t(troubleKey(trouble))}</p>
            <span className="watch-trouble-keys">
              <a
                className="watch-trouble-link"
                href={escapeTo(item)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t(item.kind === 'source' ? 'openOriginal' : 'openOnYouTube')}
              </a>
              {canControl && queued > 0 && (
                <button type="button" className="tool-open" onClick={() => setState(advance(state))}>
                  {t('skip')}
                </button>
              )}
            </span>
          </div>
        )}
      </div>

      {framed && !trouble && framable && <p className="watch-note">{t('frameNote')}</p>}
    </div>
  );
}

/**
 * Which sentence this is. A page we may not frame lands on the same one
 * as a source that would not play: from where the room is sitting, the
 * two are the same disappointment with the same way out.
 */
function troubleKey(trouble: Trouble | null): string {
  if (trouble === 'blocked') {
    return 'blocked';
  }
  return trouble === 'unsupported' ? 'noHls' : 'failed';
}

/** Where somebody can go and watch this themselves, when we cannot show it. */
function escapeTo(item: WatchItem): string {
  if (item.kind === 'video') {
    return `https://www.youtube.com/watch?v=${item.video}`;
  }
  if (item.kind === 'list') {
    return `https://www.youtube.com/playlist?list=${item.list}`;
  }
  return item.page ?? item.url;
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
 * This is also the kind that carries the sites whose player is only built
 * after a click: each person clicks in their own frame, with their own
 * session, which is exactly what a link signed for one viewer needs.
 */
function FramedPage({ url, title }: { url: string; title: string }) {
  return (
    <iframe
      className="watch-embed"
      src={url}
      title={title}
      sandbox="allow-scripts allow-same-origin allow-forms"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
}

/**
 * YouTube's player, and the sampler that keeps it honest.
 *
 * Two things move the room on by themselves, and both are reported by
 * whoever sees them first: a video ending (the queue advances) and a
 * playlist walking to its next video (the room follows the index).
 *
 * While we are the ones applying the room's state, sampling is suspended:
 * seekTo and playVideo fire the same events a person would.
 */
function YouTubeStage({
  state,
  at,
  mine,
  setState,
  speakerOn,
  speakerLevel,
  canControl,
  resyncRequest,
  item,
  onPlayingHere,
  onTrouble,
}: ToolViewProps<WatchState> & {
  state: WatchState;
  item: YouTubeItem;
  canControl: boolean;
  resyncRequest: number;
  onPlayingHere: (playing: boolean) => void;
  onTrouble: (trouble: Trouble) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);

  // Read by callbacks that outlive a render (the sampler, the player's
  // own events), so they always see the room's latest word.
  const roomRef = useRef({ state, at });
  roomRef.current = { state, at };
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const speakerRef = useRef(speakerOn);
  speakerRef.current = speakerOn;
  const levelRef = useRef(speakerLevel);
  levelRef.current = speakerLevel;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const canControlRef = useRef(canControl);
  canControlRef.current = canControl;
  const troubleRef = useRef(onTrouble);
  troubleRef.current = onTrouble;
  const playingHereRef = useRef(onPlayingHere);
  playingHereRef.current = onPlayingHere;

  /** What the player has loaded — not necessarily the room's, yet. */
  const loadedRef = useRef(loadKeyOf(item));
  /** Sampling is suspended until this moment (see QUIET_MS). */
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
  /** A controller's scrub burst, waiting for the last position. */
  const pendingSeekRef = useRef<PendingSeekReport | null>(null);
  /** Runtime detection covers ordinary watch links that happen to be live. */
  const knownLiveRef = useRef(item.kind === 'video' && item.live === true);
  knownLiveRef.current ||= item.kind === 'video' && item.live === true;

  /**
   * Called for everything WE do to the player: the sampler leaves it
   * alone for a moment (its own seeks fire the events a person's would),
   * and the player counts as on its way until it arrives.
   */
  function quiet(from: { time: number; playing: boolean }): void {
    const now = Date.now();
    quietUntilRef.current = now + QUIET_MS;
    settlingRef.current = true;
    settleDeadlineRef.current = now + SETTLE_TIMEOUT_MS;
    pendingSeekRef.current = null;
    // The baseline moves with what we just did, or the correction itself
    // would read as a jump on the next tick.
    sampleRef.current = { time: from.time, at: now, playing: from.playing };
  }

  /** The live edge also teaches us that an ordinary watch URL is live. */
  function liveEdge(player: YouTubePlayer): number | undefined {
    const edge = youtubeLiveEdgeOf(player, knownLiveRef.current);
    if (edge !== undefined) {
      knownLiveRef.current = true;
    }
    return edge;
  }

  /**
   * A new broadcast has `time: 0`, but zero means its beginning to YouTube.
   * Start at the edge and let the controller publish that single canonical
   * position. A viewer does the same locally while waiting for that update.
   */
  function alignNewLive(player: YouTubePlayer): boolean {
    const room = roomRef.current;
    const current = room.state.now;
    if (current.kind !== 'video') {
      return false;
    }
    const edge = liveEdge(player);
    if (edge === undefined || (current.live === true && room.state.time !== 0)) {
      return false;
    }
    if (Math.abs(player.getCurrentTime() - edge) > DRIFT_TOLERANCE_SECONDS) {
      player.seekTo(edge, true);
    }
    quiet({ time: edge, playing: room.state.playing });
    if (canControlRef.current) {
      setStateRef.current({
        ...room.state,
        now: { ...current, live: true },
        time: edge,
      });
    }
    return true;
  }

  /** Brings this player to whatever the room last said. */
  function applyRoom(force = false): void {
    const player = playerRef.current;
    const room = roomRef.current;
    const current = room.state.now;
    if (!player || current.kind === 'source') {
      // Still loading, or the room moved to something this player does not
      // play — in which case we are on our way out anyway.
      return;
    }
    const currentKey = loadKeyOf(current);
    if (currentKey !== loadedRef.current) {
      loadedRef.current = currentKey;
      knownLiveRef.current = current.kind === 'video' && current.live === true;
      const target = positionAt(room.state, room.at);
      quiet({ time: target, playing: room.state.playing });
      if (current.kind === 'video') {
        const load = room.state.playing ? player.loadVideoById : player.cueVideoById;
        load.call(player, { videoId: current.video, startSeconds: target });
      } else {
        const load = room.state.playing ? player.loadPlaylist : player.cuePlaylist;
        load.call(player, {
          list: current.list,
          listType: 'playlist',
          index: current.index,
          startSeconds: target,
        });
      }
      return;
    }
    knownLiveRef.current ||= current.kind === 'video' && current.live === true;
    const edge = liveEdge(player);
    const target = edge !== undefined && room.state.time === 0 ? edge : positionAt(room.state, room.at);
    if (current.kind === 'list' && player.getPlaylistIndex() !== current.index) {
      // The room is on another of this playlist's videos: a jump inside
      // what is already loaded, never a reload.
      quiet({ time: target, playing: room.state.playing });
      player.playVideoAt(current.index);
      return;
    }
    if (mineRef.current && !force) {
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
    const current = room.state.now;
    if (!player || current.kind === 'source' || Date.now() < quietUntilRef.current) {
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
    playingHereRef.current(
      playerState === PLAYER_STATE.playing || playerState === PLAYER_STATE.buffering,
    );

    if (alignNewLive(player)) {
      return;
    }

    if (!canControlRef.current) {
      // A viewer's player follows the controller. Even an older iframe
      // that still exposes its chrome is corrected locally and never
      // reports the viewer's hand as room state.
      applyRoom();
      return;
    }

    // A playlist walked to its next video on its own: the room follows
    // whoever noticed first, and the ones that notice a second later send
    // the same thing.
    if (current.kind === 'list') {
      let index = -1;
      try {
        index = player.getPlaylistIndex();
      } catch {
        index = -1;
      }
      if (index >= 0 && index !== current.index) {
        settlingRef.current = false;
        setStateRef.current(withListIndex(room.state, index));
        return;
      }
    }

    if (playerState === PLAYER_STATE.ended) {
      // The end of a video, or of a whole playlist: the queue moves on.
      // A straggler that gets here late finds the room already moved on
      // and says nothing (queue.ts).
      if (mayAdvanceFrom(room.state, current) && (current.kind === 'video' || atEndOfList(player))) {
        settlingRef.current = false;
        setStateRef.current(advance(room.state));
      }
      return;
    }

    if (playerState === PLAYER_STATE.unstarted || playerState === PLAYER_STATE.cued) {
      // Not started: something still getting ready, or an autoplay the
      // browser refused. Nobody paused anything — so nothing is reported;
      // we ask our own player again, and if the browser keeps saying no
      // the stage offers the room's own key (see `stalled` in Together).
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
    const reading = { time, at: now, playing };
    sampleRef.current = reading;
    const target = positionAt(room.state, room.at, now);
    const decision = decideControllerSync(
      previous,
      reading,
      { playing: room.state.playing, time: target },
      settlingRef.current,
      pendingSeekRef.current,
    );
    pendingSeekRef.current = decision.pending;
    const { action } = decision;
    if (action.kind === 'wait') {
      // A manual scrub burst is intentionally left alone until its last
      // position settles. Retrying the old room target here would undo it.
      if (pendingSeekRef.current) {
        return;
      }
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
      controls: canControl,
      onReady: (player) => {
        if (cancelled) {
          player.destroy();
          return;
        }
        playerRef.current = player;
        player.setVolume(Math.round(Math.min(1, levelRef.current) * 100));
        if (!speakerRef.current) {
          player.mute();
        }
        if (alignNewLive(player)) {
          return;
        }
        // The room may have moved on while the API was loading.
        applyRoom();
      },
      onStateChange: () => sample(),
      // Something that cannot be played here (removed, private, embedding
      // off) is not a broken room: say so, and the keys to move on or to
      // close it are right there.
      onError: () => troubleRef.current('blocked'),
    }).catch(() => troubleRef.current('blocked'));

    const timer = setInterval(sample, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
      mount.remove();
    };
    // Mounted once per stage: a change of which video is on is applied to
    // the player that is already here, never by building a second one.
    // Whether it was built with chrome is the one thing that cannot be
    // applied afterwards, so that — and only that — builds a second one,
    // which `onReady` puts straight back where the room is. The room's
    // controller does not change while a watch is on; this client can
    // still learn who it is a beat after the state arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canControl]);

  // The room said something.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(applyRoom, [state, at]);

  // A resync is deliberately local: viewers cannot move the room, and the
  // controller uses it to return to the room's own canonical position.
  useEffect(() => {
    if (resyncRequest > 0) {
      applyRoom(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resyncRequest]);

  // Speakers off silences the video too — a room you cannot hear is a
  // room you cannot hear. The level beside it is the same fact at higher
  // resolution: how much of this, relative to the people watching it.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    player.setVolume(Math.round(Math.min(1, speakerLevel) * 100));
    if (speakerOn) {
      player.unMute();
    } else {
      player.mute();
    }
  }, [speakerOn, speakerLevel]);

  return <div className="watch-youtube" ref={hostRef} inert={!canControl || undefined} />;
}

function MediaSource({
  state,
  at,
  mine,
  setState,
  speakerOn,
  speakerLevel,
  canControl,
  resyncRequest,
  item,
  onPlayingHere,
  onTrouble,
}: ToolViewProps<WatchState> & {
  state: WatchState;
  item: SourceItem;
  canControl: boolean;
  resyncRequest: number;
  onPlayingHere: (playing: boolean) => void;
  onTrouble: (trouble: Trouble) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef({ state, at });
  roomRef.current = { state, at };
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const troubleRef = useRef(onTrouble);
  troubleRef.current = onTrouble;
  const playingHereRef = useRef(onPlayingHere);
  playingHereRef.current = onPlayingHere;
  /** What this element was pointed at, whatever the room has done since. */
  const attachedRef = useRef<WatchItem>(item);
  /** Sampling and reporting are suspended until this moment. */
  const quietUntil = useRef(0);
  /**
   * How many times in a row this browser has refused to start playing.
   *
   * Autoplay with sound is blocked by every browser until somebody has
   * interacted with the page, and a player that keeps being told to play
   * keeps refusing. That is not the bug. The bug is that each attempt
   * quiets the sampler, and a sampler quieted once a second is a sampler
   * that never hears the person press PAUSE — so the room stays playing
   * and this browser keeps being dragged back to it. After a few
   * refusals we stop asking and wait to be asked — by the element's own
   * controls, which the controller has, or by the room's key over the
   * picture, which is what everybody else gets (`stalled` in Together).
   */
  const refusedRef = useRef(0);

  function quiet(): void {
    quietUntil.current = Date.now() + QUIET_MS;
  }

  /** Starts the element, and gets out of the way if it will not start. */
  function tryPlay(video: HTMLVideoElement): void {
    void video
      .play()
      .then(() => {
        refusedRef.current = 0;
      })
      .catch(() => {
        refusedRef.current += 1;
        // We are not applying anything after all: stop suppressing what
        // the person does next.
        quietUntil.current = 0;
      });
  }

  /** Anything a person does to the player is news for the room. */
  function report(): void {
    const video = videoRef.current;
    if (!canControl || !video || Date.now() < quietUntil.current) {
      return;
    }
    const room = roomRef.current.state;
    setStateRef.current({
      ...room,
      playing: !video.paused,
      // A broadcast has no position worth carrying, and writing one
      // would send every viewer chasing a number that means nothing.
      time: isLive(room.now) ? 0 : video.currentTime,
    });
  }

  /**
   * It reached the end: the queue moves on, exactly as a YouTube video
   * ending does. A straggler whose copy ends after the room already moved
   * says nothing (queue.ts).
   */
  function ended(): void {
    if (!canControl) {
      return;
    }
    const room = roomRef.current.state;
    if (mayAdvanceFrom(room, attachedRef.current)) {
      setStateRef.current(advance(room));
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    let attached: { destroy(): void } | null = null;
    let cancelled = false;
    const room = roomRef.current;
    attachedRef.current = room.state.now;
    quiet();
    video.muted = !speakerOn;
    video.volume = Math.min(1, speakerLevel);
    void attachSource(video, item, (failure) => troubleRef.current(failure)).then((source) => {
      if (cancelled) {
        source.destroy();
        return;
      }
      attached = source;
      if (!isLive(item)) {
        video.currentTime = positionAt(room.state, room.at);
      }
      if (room.state.playing) {
        // A browser that refuses to autoplay is not an error: the element
        // keeps its controls and whoever is watching presses play. What
        // must not happen is telling the room it was paused.
        tryPlay(video);
      }
    });
    return () => {
      cancelled = true;
      attached?.destroy();
    };
    // Rebuilt when the room changes source, never on a position change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url, item.play]);

  // The room said something: bring this player to it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mineRef.current) {
      // We are the ones who moved it: it is already there, and a round
      // trip's worth of correction would jump it under our own hands.
      return;
    }
    quiet();
    // The room said something new: whatever this browser refused before
    // was about the old intention.
    refusedRef.current = 0;
    if (state.playing && video.paused) {
      tryPlay(video);
    } else if (!state.playing && !video.paused) {
      video.pause();
    }
    if (hasSharedClock(state.now)) {
      const target = positionAt(state, at);
      if (Math.abs(video.currentTime - target) > DRIFT_TOLERANCE_SECONDS) {
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
      playingHereRef.current(!video.paused);
      const room = roomRef.current;
      const reading = {
        time: video.currentTime,
        paused: video.paused,
        // HAVE_FUTURE_DATA: below this it cannot say where it is, and a
        // player on its way somewhere is not evidence of anything.
        busy: video.seeking || video.readyState < 3,
        liveEdge: liveEdgeOf(video),
      };
      const correction = isLive(room.state.now)
        ? liveCorrectionFor(reading, room.state)
        : correctionFor(reading, {
            playing: room.state.playing,
            time: positionAt(room.state, room.at),
          });
      if (correction.kind === 'idle') {
        return;
      }
      if (correction.kind === 'play' && refusedRef.current >= REFUSALS_BEFORE_GIVING_UP) {
        // It has said no three times. Asking again every second costs the
        // person their own pause button (see refusedRef).
        return;
      }
      quiet();
      if (correction.kind === 'play') {
        tryPlay(video);
      } else if (correction.kind === 'pause') {
        video.pause();
      } else {
        video.currentTime = correction.time;
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Asked to catch up — the key in the bar, or the one over the picture.
  // A person pressing it is the gesture the browser was holding out for,
  // so the refusals are forgiven and this copy tries again from where the
  // room actually is. Local: nothing here reaches the room.
  useEffect(() => {
    const video = videoRef.current;
    if (resyncRequest === 0 || !video) {
      return;
    }
    refusedRef.current = 0;
    quiet();
    if (hasSharedClock(roomRef.current.state.now)) {
      video.currentTime = positionAt(roomRef.current.state, roomRef.current.at);
    }
    if (roomRef.current.state.playing) {
      tryPlay(video);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resyncRequest]);

  // Speakers off silences this too — a room you cannot hear is a room you
  // cannot hear. Every player stays inside the range its API accepts;
  // WebRTC voices and shared audio are what the room can amplify beyond it.
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !speakerOn;
      video.volume = Math.min(1, speakerLevel);
    }
  }, [speakerOn, speakerLevel]);

  return (
    <video
      ref={videoRef}
      className="watch-media"
      controls={canControl}
      playsInline
      onPlay={() => {
        playingHereRef.current(true);
        report();
      }}
      onPause={() => {
        playingHereRef.current(false);
        report();
      }}
      onSeeked={report}
      onEnded={ended}
    />
  );
}

function TwitchSource({
  state,
  at,
  mine,
  setState,
  speakerOn,
  speakerLevel,
  canControl,
  resyncRequest,
  item,
  onPlayingHere,
  onTrouble,
}: ToolViewProps<WatchState> & {
  state: WatchState;
  item: SourceItem;
  canControl: boolean;
  resyncRequest: number;
  onPlayingHere: (playing: boolean) => void;
  onTrouble: (trouble: Trouble) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwitchPlayer | null>(null);
  const roomRef = useRef({ state, at });
  roomRef.current = { state, at };
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const speakerRef = useRef(speakerOn);
  speakerRef.current = speakerOn;
  const levelRef = useRef(speakerLevel);
  levelRef.current = speakerLevel;
  const troubleRef = useRef(onTrouble);
  troubleRef.current = onTrouble;
  const playingHereRef = useRef(onPlayingHere);
  playingHereRef.current = onPlayingHere;
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
    mount.className = 'watch-twitch-mount';
    host.appendChild(mount);
    const room = roomRef.current;
    quietUntil.current = Date.now() + QUIET_MS;

    void mountTwitch(mount, {
      channel: item.twitch?.channel,
      video: item.twitch?.video ?? item.twitch?.clip,
      autoplay: room.state.playing,
      controls: canControl,
      muted: !speakerRef.current,
      startSeconds: positionAt(room.state, room.at),
      onReady: (player) => {
        if (cancelled) {
          return;
        }
        playerRef.current = player;
        player.setMuted(!speakerRef.current);
        player.setVolume(Math.min(1, levelRef.current));
        playingHereRef.current(!player.isPaused());
      },
      onPlayPause: () => {
        const player = playerRef.current;
        if (!player) {
          return;
        }
        playingHereRef.current(!player.isPaused());
        if (!canControl || Date.now() < quietUntil.current) {
          return;
        }
        const current = roomRef.current.state;
        setStateRef.current({
          ...current,
          playing: !player.isPaused(),
          time: isLive(current.now) ? 0 : player.getCurrentTime(),
        });
      },
    }).catch(() => troubleRef.current('failed'));

    // An autoplay their embed never attempted fires no event at all, so
    // the tick is what notices a channel that simply never started.
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (player) {
        playingHereRef.current(!player.isPaused());
      }
    }, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      playerRef.current = null;
      mount.remove();
    };
    // Rebuilt when the room changes channel, and when this client learns
    // it is the one driving: an embed's controls are settled when it is
    // built (see the YouTube mount above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url, canControl]);

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
    if (hasSharedClock(state.now)) {
      const target = positionAt(state, at);
      if (Math.abs(player.getCurrentTime() - target) > DRIFT_TOLERANCE_SECONDS) {
        player.seek(target);
      }
    }
  }, [state, at, mine]);

  // Asked to catch up (see the same effect in MediaSource).
  useEffect(() => {
    const player = playerRef.current;
    if (resyncRequest === 0 || !player) {
      return;
    }
    quietUntil.current = Date.now() + QUIET_MS;
    const room = roomRef.current;
    if (hasSharedClock(room.state.now)) {
      player.seek(positionAt(room.state, room.at));
    }
    if (room.state.playing) {
      player.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resyncRequest]);

  useEffect(() => {
    playerRef.current?.setMuted(!speakerOn);
    playerRef.current?.setVolume(Math.min(1, speakerLevel));
  }, [speakerOn, speakerLevel]);

  return <div className="watch-twitch" ref={hostRef} inert={!canControl || undefined} />;
}
