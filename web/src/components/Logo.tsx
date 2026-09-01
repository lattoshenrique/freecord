import './logo.css';

type Props = { size?: number; className?: string };

/** The three peers and the edges between them: same points as the path below. */
const PEERS = [
  { cx: 40.1, cy: 14.4 },
  { cx: 49.5, cy: 49.5 },
  { cx: 14.4, cy: 40.1 },
];
const MESH = 'M40.1 14.4 49.5 49.5 14.4 40.1Z';

/**
 * The Freecord mark: three people linked peer to peer with nothing in
 * the middle — the same P2P mesh drawn in docs/architecture.md.
 * Same geometry as web/public/favicon.svg and desktop/build/icon.svg.
 *
 * One component for every page, and it is always alive: on mount the peers
 * join one by one and the edges are dashed while they negotiate, then close —
 * the way the home's background plays a room. From then on a packet keeps
 * running the ring and the peers keep their heartbeats, for as long as the
 * mark is on screen. Styles in logo.css.
 */
export default function Logo({ size = 56, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={['logo', className ?? ''].join(' ').trim()}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="logo-grad"
          x1="14"
          y1="14"
          x2="50"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#5865f2" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* Negotiating: the same marching dashes a fresh peer's edges wear
          in the background. Fades out as the solid edges close. */}
      <path
        className="logo-negotiating"
        d={MESH}
        fill="none"
        stroke="url(#logo-grad)"
        strokeWidth="5.5"
        strokeLinejoin="round"
        pathLength={100}
      />

      <path
        className="logo-mesh"
        d={MESH}
        fill="none"
        stroke="url(#logo-grad)"
        strokeWidth="5.5"
        strokeLinejoin="round"
        pathLength={100}
      />

      {PEERS.map((peer, index) => (
        <g key={index} className="logo-peer" style={{ '--i': index } as React.CSSProperties}>
          <circle className="logo-beat" cx={peer.cx} cy={peer.cy} r="7.5" />
          <circle className="logo-node" cx={peer.cx} cy={peer.cy} r="7.5" fill="url(#logo-grad)" />
        </g>
      ))}

      {/* Payload in flight around the ring: the background's comet, at mark scale. */}
      <circle className="logo-packet" r="2.2" fill="#fff" />
    </svg>
  );
}
