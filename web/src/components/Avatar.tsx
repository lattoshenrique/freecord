import { useMemo } from 'react';
import { AVATAR_GRID, avatarFrom, hashString } from '../lib/identity';

/**
 * The guest's identicon: a symmetric glyph on a two-tone ground, both derived
 * from the name (see lib/identity.ts). It carries no size of its own — the
 * caller's class does — so the same component fits a room tile that scales
 * with its container and the big avatar on the pre-join card.
 */
export default function Avatar({ name, className }: { name: string; className?: string }) {
  const { hue, cells } = useMemo(() => avatarFrom(name), [name]);
  // The lowest lit row is the mouth: the speaking styles open and close it
  // while the rest of the face holds still. Every glyph has one — avatarFrom
  // never draws fewer than four cells.
  const mouthRow = useMemo(() => {
    let last = 0;
    cells.forEach((on, index) => {
      if (on) last = Math.floor(index / AVATAR_GRID);
    });
    return last;
  }, [cells]);
  // Derived from the name, not from useId(): the gradient is the same drawing
  // for the same name, and the id must survive going into a url() reference.
  const gradientId = `avatar-${hashString(name).toString(36)}`;

  return (
    <svg
      className={className}
      // One cell of margin on every side: without it the glyph collides with
      // the rounded frame the caller draws around it.
      viewBox={`-1 -1 ${AVATAR_GRID + 2} ${AVATAR_GRID + 2}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 62% 44%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 42) % 360} 68% 58%)`} />
        </linearGradient>
      </defs>
      <rect
        x="-1"
        y="-1"
        width={AVATAR_GRID + 2}
        height={AVATAR_GRID + 2}
        fill={`url(#${gradientId})`}
      />
      {cells.map((on, index) =>
        on ? (
          <rect
            key={index}
            x={index % AVATAR_GRID}
            y={Math.floor(index / AVATAR_GRID)}
            width="1"
            height="1"
            rx="0.26"
            fill="rgba(255, 255, 255, 0.9)"
            data-part={Math.floor(index / AVATAR_GRID) === mouthRow ? 'mouth' : undefined}
          />
        ) : null,
      )}
    </svg>
  );
}
