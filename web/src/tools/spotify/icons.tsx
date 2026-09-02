/**
 * The tool's own glyphs. A tool draws its own: the app's icon set is not
 * part of the contract, and a tool that imported it would break the day
 * that file is reorganised.
 *
 * None of them is Spotify's mark. Somebody else's logo is somebody else's
 * to license, and a record with a hole in it says "music" in any room.
 */
import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

/** A record turning — the shelf row and the dock's lit key. */
export function ListenIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 5.4a6.6 6.6 0 0 1 5 3" />
    </svg>
  );
}

/** A song. */
export function NoteGlyph() {
  return (
    <svg {...base}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  );
}

/** A record, for an album. */
export function DiscGlyph() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

/** A list, for a playlist. */
export function ListGlyph() {
  return (
    <svg {...base}>
      <path d="M4 7h10M4 12h10M4 17h6" />
      <path d="M17 11.5l4 2.5-4 2.5z" />
    </svg>
  );
}

/** Somebody, for an artist. */
export function ArtistGlyph() {
  return (
    <svg {...base}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

/** A microphone, for a podcast and its episodes. */
export function MicGlyph() {
  return (
    <svg {...base}>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}

/** Put this one on now. */
export function PlayGlyph() {
  return (
    <svg {...base}>
      <path d="M7 4.5l12 7.5-12 7.5z" />
    </svg>
  );
}

/** On to the next thing the room lined up. */
export function SkipGlyph() {
  return (
    <svg {...base}>
      <path d="M6 5l9 7-9 7z" />
      <path d="M18 5v14" />
    </svg>
  );
}

export function CloseGlyph() {
  return (
    <svg {...base}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
