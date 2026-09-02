/**
 * The tool's own glyphs. A tool draws its own: the app's icon set is not
 * part of the contract, and a tool that imported it would break the day
 * that file is reorganised. Two paths on a 24-grid cost less than the
 * coupling would.
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

/** A screen with a play head — the shelf row and the dock's lit key. */
export function YouTubeIcon() {
  return (
    <svg {...base}>
      <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
      <path d="M10.5 9.2v5.6l4.6-2.8z" />
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
