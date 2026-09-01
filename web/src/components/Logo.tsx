type Props = { size?: number; className?: string };

/**
 * The Freecord mark: three people linked peer to peer with nothing in
 * the middle — the same P2P mesh drawn in docs/architecture.md.
 * Same geometry as web/public/favicon.svg and desktop/build/icon.svg.
 */
export default function Logo({ size = 56, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
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
      <path
        d="M40.1 14.4 49.5 49.5 14.4 40.1Z"
        fill="none"
        stroke="url(#logo-grad)"
        strokeWidth="5.5"
        strokeLinejoin="round"
      />
      <circle cx="40.1" cy="14.4" r="7.5" fill="url(#logo-grad)" />
      <circle cx="49.5" cy="49.5" r="7.5" fill="url(#logo-grad)" />
      <circle cx="14.4" cy="40.1" r="7.5" fill="url(#logo-grad)" />
    </svg>
  );
}
