import { useMemo, type CSSProperties, type Ref } from 'react';
import { AVATAR_SIZE, avatarFrom, hashString } from '../lib/identity';

/**
 * The guest's face: a little mascot on a two-tone ground, both derived from
 * the name (see lib/identity.ts). It carries no size of its own — the caller's
 * class does — so the same component fits a room tile that scales with its
 * container and the big avatar on the pre-join card.
 */
export default function Avatar({
  name,
  className,
  micOff,
  deafened,
  ref,
}: {
  name: string;
  className?: string;
  /** Microphone off: the mouth is zipped. */
  micOff?: boolean;
  /** Speakers off: earmuffs on. */
  deafened?: boolean;
  /** The room's tiles drive the mouth through it (see RoomView's Tile). */
  ref?: Ref<SVGSVGElement>;
}) {
  const { ground, palette: fills, shapes } = useMemo(
    () => avatarFrom(name, { micOff, deafened }),
    [name, micOff, deafened],
  );
  // Blinks fall out of step across a room: each face waits its own while.
  const blinkDelay = `${-((hashString(name) >>> 3) % 4000)}ms`;
  // Derived from the name, not from useId(): the gradient is the same drawing
  // for the same name, and the id must survive going into a url() reference.
  const gradientId = `avatar-${hashString(name).toString(36)}`;

  let zees = 0;
  return (
    <svg
      ref={ref}
      className={className}
      viewBox={`0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1={ground.x1} y1={ground.y1} x2={ground.x2} y2={ground.y2}>
          <stop offset="0%" stopColor={ground.from} />
          <stop offset="100%" stopColor={ground.to} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={AVATAR_SIZE} height={AVATAR_SIZE} fill={`url(#${gradientId})`} />
      {shapes.map((shape, index) => {
        // --cell is the drawing order: a caller that animates the mascot
        // arriving staggers the shapes by it. data-shape marks the shapes
        // that arrive, as opposed to the ground. The z's of a sleeper are
        // drawn on top of each other and set off one after another.
        if (shape.part === 'zzz') zees += 1;
        const common = {
          'data-shape': '',
          'data-part': shape.part,
          style: {
            '--cell': index,
            ...(shape.part === 'eye' ? { animationDelay: blinkDelay } : null),
            ...(shape.part === 'zzz' ? { animationDelay: `${(zees - 1) * 1000}ms` } : null),
          } as CSSProperties,
        };
        if (shape.kind === 'rect') {
          return (
            <rect
              key={index}
              x={shape.x}
              y={shape.y}
              width={shape.w}
              height={shape.h}
              rx={shape.rx}
              fill={fills[shape.fill]}
              {...common}
            />
          );
        }
        if (shape.kind === 'ellipse') {
          return (
            <ellipse
              key={index}
              cx={shape.cx}
              cy={shape.cy}
              rx={shape.rx}
              ry={shape.ry}
              fill={fills[shape.fill]}
              {...common}
            />
          );
        }
        return (
          <path
            key={index}
            d={shape.d}
            fill={shape.fill ? fills[shape.fill] : 'none'}
            stroke={shape.stroke ? fills[shape.stroke] : undefined}
            strokeWidth={shape.width}
            strokeLinecap="round"
            {...common}
          />
        );
      })}
    </svg>
  );
}
