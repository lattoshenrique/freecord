/**
 * What the room has on, on the room's stage.
 *
 * There is no shared player here and no clock to keep, which makes this
 * the simplest stage in the shelf: everybody is handed the SAME embed,
 * built from the two fields in the room's state (link.ts), and each
 * person presses play on their own copy. Nothing in this file talks to
 * Spotify — we only put its page in a frame — so nothing in this file
 * can pretend to know whether anybody is listening.
 *
 * The frame is Spotify's own address and never ours, which is the whole
 * of its security story: `embedUrl` builds it from a kind out of a fixed
 * list and 22 base62 characters, so a peer's message cannot become an
 * address of its own choosing (state.ts). It is left unsandboxed on
 * purpose — the video tool sandboxes because it frames a page a stranger
 * chose, where `allow-same-origin` pointed at US would stop being a
 * sandbox at all; here the host is a constant in our own source, and a
 * sandbox would buy nothing while risking the login and DRM paths the
 * player needs to give somebody more than a preview.
 *
 * Speakers off takes the player away rather than turning it down. A
 * cross-origin frame has no volume we can reach, and the room's speaker
 * key means silence — so the honest way to obey it is to not have a
 * player at all while it is off.
 */
import type { ToolViewProps } from '../contract';
import { CloseGlyph, SkipGlyph } from './icons';
import { kindLabel } from './kinds';
import { embedUrl, pageUrl } from './link';
import { advance } from './queue';
import type { ListenState } from './state';
import './stage.css';

/** What Spotify's player needs to be allowed to do inside the frame. */
const FRAME_ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';

export default function Stage({ state, by, self, peers, speakerOn, setState, t }: ToolViewProps<ListenState>) {
  if (!state) {
    return null;
  }
  const queued = state.queue.length;
  // Who put it on, when we know their name: the room's own way of saying
  // whose turn on the aux this is.
  const who = by === self?.id ? self : (peers.find((peer) => peer.id === by) ?? null);

  return (
    <div className="screen-stage spotify-stage fade-in">
      <div className="spotify-bar">
        <span className="spotify-title">
          {t('stageLabel')}
          {who && <span className="spotify-by">{t('putOn', { name: who.name })}</span>}
          {queued > 0 && <span className="spotify-queued">{t('queued', { count: queued })}</span>}
        </span>
        <span className="spotify-keys">
          {queued > 0 && (
            <button
              type="button"
              className="spotify-key"
              aria-label={t('skip')}
              title={t('skip')}
              onClick={() => setState(advance(state))}
            >
              <SkipGlyph />
            </button>
          )}
          <button
            type="button"
            className="spotify-key spotify-close"
            aria-label={t('closeForAll')}
            title={t('closeForAll')}
            onClick={() => setState(null)}
          >
            <CloseGlyph />
          </button>
        </span>
      </div>

      <div className="spotify-frame" data-kind={state.now.kind}>
        {speakerOn ? (
          <iframe
            /* A new thing on is a new frame, not a navigation inside the
               old one: keying it on the address is what keeps the player
               from carrying the last song's state into this one. */
            key={embedUrl(state.now)}
            className="spotify-player"
            src={embedUrl(state.now)}
            title={`${t('stageLabel')} — ${kindLabel(state.now.kind, t)}`}
            allow={FRAME_ALLOW}
            allowFullScreen
          />
        ) : (
          <div className="spotify-quiet" role="status">
            <p className="spotify-quiet-line">{t('speakersOff')}</p>
            <p className="spotify-quiet-hint">{t('speakersOffHint')}</p>
          </div>
        )}
        <p className="spotify-note">
          {t('ownPlay')}{' '}
          <a
            className="spotify-link"
            href={pageUrl(state.now)}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('openOnSpotify')}
          </a>
        </p>
      </div>
    </div>
  );
}
