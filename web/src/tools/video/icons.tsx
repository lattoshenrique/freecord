/**
 * The tool's own glyphs. A tool draws its own: the app's icon set is not
 * part of the contract, and a tool that imported it would break the day
 * that file is reorganised.
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

/**
 * A play head coming out of a window: something from somewhere else,
 * brought into the room. Distinct from the YouTube tool's plain screen,
 * because the shelf shows the two of them one under the other.
 */
export function VideoIcon() {
  return (
    <svg {...base}>
      <path d="M14 4.5H5a2.5 2.5 0 0 0-2.5 2.5v10A2.5 2.5 0 0 0 5 19.5h9" />
      <path d="M9 10.2v3.6l3-1.8z" />
      <path d="M17.5 4.5h4v4M21.5 4.5l-6 6" />
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

/** Marks the candidate the room would get a shared position on. */
export function ClockGlyph() {
  return (
    <svg {...base} width={14} height={14} strokeWidth={2}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

/** Marks the candidate everybody drives for themselves. */
export function HandGlyph() {
  return (
    <svg {...base} width={14} height={14} strokeWidth={2}>
      <path d="M8.5 11V6.4a1.6 1.6 0 1 1 3.2 0V11" />
      <path d="M11.7 11V5.6a1.6 1.6 0 1 1 3.2 0V11" />
      <path d="M14.9 11.4V8.6a1.6 1.6 0 1 1 3.2 0v5.6a6 6 0 0 1-6 6h-.8a5 5 0 0 1-4-2l-2.2-3a1.6 1.6 0 0 1 2.4-2l1.8 1.8" />
    </svg>
  );
}
