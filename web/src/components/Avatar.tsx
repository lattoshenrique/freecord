import { useMemo, type CSSProperties, type ReactNode, type Ref } from 'react';
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
  idle,
  bare,
  ref,
}: {
  name: string;
  className?: string;
  /** Microphone off: the mouth is zipped. */
  micOff?: boolean;
  /** Speakers off: fingers in the ears. */
  deafened?: boolean;
  /**
   * Nobody is talking through this face (the pre-join card): it fidgets on
   * its own — sways its limbs, mumbles now and then — so it reads as alive
   * before the room gives it anything to do.
   */
  idle?: boolean;
  /** No ground: the mascot alone, for somewhere it stands free of a tile. */
  bare?: boolean;
  /** The room's tiles drive the mouth through it (see RoomView's Tile). */
  ref?: Ref<SVGSVGElement>;
}) {
  const { ground, palette: fills, shapes } = useMemo(
    () => avatarFrom(name, { micOff, deafened }),
    [name, micOff, deafened],
  );
  // Blinks, glances and fidgets fall out of step across a room: each face
  // waits its own while, and looks its own way.
  const hash = hashString(name);
  const blinkDelay = `${-((hash >>> 3) % 4000)}ms`;
  const gazeDelay = `${-((hash >>> 5) % 11000)}ms`;
  const idleDelay = `${-((hash >>> 7) % 9000)}ms`;
  const gaze = (hash >>> 9) % 3;
  // Derived from the name, not from useId(): the gradient is the same drawing
  // for the same name, and the id must survive going into a url() reference.
  const gradientId = `avatar-${hashString(name).toString(36)}`;

  // The drawing, in order. --cell is that order: a caller that animates the
  // mascot arriving staggers the shapes by it, and data-shape marks the
  // shapes that arrive, as opposed to the ground. They are drawn inside one
  // group so that a caller can move the mascot on its own — the room's tile
  // makes it lean while its guest talks — and leave the ground and the frame
  // around it still. The eyes travel together
  // when the face glances aside, so they are gathered in one group, placed
  // where the first of them is drawn. The z's of a sleeper are drawn on top
  // of each other and set off one after another; limbs sway out of step.
  const drawn: ReactNode[] = [];
  const eyes: ReactNode[] = [];
  let gazeAt = -1;
  let zees = 0;
  let limbs = 0;
  shapes.forEach((shape, index) => {
    if (shape.part === 'zzz') zees += 1;
    const limb = shape.part === 'arm' || shape.part === 'leg' || shape.part === 'antenna';
    if (limb) limbs += 1;
    const common = {
      'data-shape': '',
      'data-part': shape.part,
      style: {
        '--cell': index,
        ...(limb ? { '--limb': limbs } : null),
        ...(shape.part === 'eye' ? { animationDelay: blinkDelay } : null),
        ...(shape.part === 'zzz' ? { animationDelay: `${(zees - 1) * 1000}ms` } : null),
      } as CSSProperties,
    };
    let node: ReactNode;
    if (shape.kind === 'rect') {
      node = (
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
    } else if (shape.kind === 'ellipse') {
      node = (
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
    } else {
      node = (
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
    }
    if (shape.part === 'eye') {
      if (gazeAt < 0) gazeAt = drawn.length;
      eyes.push(node);
    } else {
      drawn.push(node);
    }
  });
  if (gazeAt >= 0) {
    drawn.splice(
      gazeAt,
      0,
      <g key="gaze" data-part="gaze">
        {eyes}
      </g>,
    );
  }

  return (
    <svg
      ref={ref}
      className={className}
      viewBox={`0 0 ${AVATAR_SIZE} ${AVATAR_SIZE}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      data-avatar=""
      data-idle={idle ? '' : undefined}
      data-mic-off={micOff ? '' : undefined}
      data-asleep={micOff && deafened ? '' : undefined}
      data-gaze={gaze}
      style={{ '--gaze-delay': gazeDelay, '--idle-delay': idleDelay } as CSSProperties}
    >
      <defs>
        <linearGradient id={gradientId} x1={ground.x1} y1={ground.y1} x2={ground.x2} y2={ground.y2}>
          <stop offset="0%" stopColor={ground.from} />
          <stop offset="100%" stopColor={ground.to} />
        </linearGradient>
      </defs>
      {!bare && (
        <rect x="0" y="0" width={AVATAR_SIZE} height={AVATAR_SIZE} fill={`url(#${gradientId})`} />
      )}
      <g data-part="mascot">{drawn}</g>
    </svg>
  );
}
