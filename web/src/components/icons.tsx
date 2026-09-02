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

export function MicIcon() {
  return (
    <svg {...base}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function MicOffIcon() {
  return (
    <svg {...base}>
      <path d="M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-.5 1.67" />
      <path d="M9 9v2a3 3 0 0 0 4.6 2.54" />
      <path d="M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.42 2.4" />
      <path d="M12 18v3" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function CamIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="6" width="12" height="12" rx="2.5" />
      <path d="M15 10.5l5-3v9l-5-3" />
    </svg>
  );
}

export function CamOffIcon() {
  return (
    <svg {...base}>
      <path d="M15 13.5V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5" />
      <path d="M10.5 6H13a2 2 0 0 1 2 2v2.5l5-3v9" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function ScreenIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17v4" />
      <path d="M9.5 10.5L12 8l2.5 2.5M12 8.5V14" />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg {...base}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

export function LeaveIcon() {
  return (
    <svg {...base}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg {...base} width={16} height={16}>
      <path d="M10 14a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 1 0-7.07-7.07L11 5.93" />
      <path d="M14 10a5 5 0 0 0-7.07 0L4.8 12.12a5 5 0 1 0 7.07 7.07L13 18.07" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...base} width={16} height={16}>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M4 12l16-8-6 16-2.5-6.5L4 12Z" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...base} width={16} height={16}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function FullscreenIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export function ExitFullscreenIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}

export function PictureInPictureIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="12" y="12" width="7" height="5" rx="1" />
    </svg>
  );
}

export function ExitPictureInPictureIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M18 16l-5-5M13 11h4M13 11v4" />
    </svg>
  );
}

export function SlidersIcon() {
  return (
    <svg {...base}>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <circle cx="15" cy="8" r="2.2" />
      <circle cx="9" cy="16" r="2.2" />
    </svg>
  );
}

const tool: SVGProps<SVGSVGElement> = { ...base, width: 15, height: 15 };

export function BoldIcon() {
  return (
    <svg {...tool}>
      <path d="M7 4h5.5a3.5 3.5 0 0 1 0 7H7zM7 11h6a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

export function ItalicIcon() {
  return (
    <svg {...tool}>
      <path d="M15 4h-5M14 4l-4 16M14 20H9" />
    </svg>
  );
}

export function CodeIcon() {
  return (
    <svg {...tool}>
      <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
    </svg>
  );
}

export function StrikeIcon() {
  return (
    <svg {...tool}>
      <path d="M5 12h14" />
      <path d="M8 8a3.5 3.5 0 0 1 3.5-3h1A3.5 3.5 0 0 1 16 8M16 16a3.5 3.5 0 0 1-3.5 3h-1A3.5 3.5 0 0 1 8 16" />
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg {...tool}>
      <path d="M9 7h11M9 12h11M9 17h11" />
      <circle cx="4.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function QuoteIcon() {
  return (
    <svg {...tool}>
      <path d="M5 5v14" />
      <path d="M10 8h9M10 12h9M10 16h6" />
    </svg>
  );
}

export function EmojiIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.4 14.3a4.7 4.7 0 0 0 7.2 0" />
      <circle cx="9" cy="9.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ShuffleIcon() {
  return (
    <svg {...base}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

export function AttachIcon() {
  return (
    <svg {...base} width={16} height={16}>
      <path d="M20.5 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.6 1.6 0 0 1-2.3-2.3l7.8-7.8" />
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function SpeakerIcon() {
  return (
    <svg {...base}>
      <path d="M4 10v4h3l4 3.5v-11L7 10H4z" />
      <path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
    </svg>
  );
}

export function SpeakerOffIcon() {
  return (
    <svg {...base}>
      <path d="M4 10v4h3l4 3.5v-11L7 10H4z" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg {...base} width={16} height={16}>
      <path d="M12 4v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function ReplyIcon() {
  return (
    <svg {...base} width={14} height={14}>
      <path d="M9 17l-5-5 5-5" />
      <path d="M4 12h9a7 7 0 0 1 7 7v1" />
    </svg>
  );
}

export function FormatIcon() {
  return (
    <svg {...base} width={16} height={16}>
      <path d="M4 18L9.5 5h1L16 18" />
      <path d="M6 13.5h8.5" />
      <path d="M18 9v9" />
      <path d="M15.5 14.5c0-1.5 1-2.5 2.5-2.5s2.5 1 2.5 2.5-1 2.5-2.5 2.5-2.5-1-2.5-2.5z" />
    </svg>
  );
}

/** Layout: everything equal. */
export function LayoutGridIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

/** Layout: one thing big, the rest in a strip. */
export function LayoutSpotlightIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="3" width="18" height="11" rx="1.5" />
      <rect x="3" y="17" width="5" height="4" rx="1" />
      <rect x="9.5" y="17" width="5" height="4" rx="1" />
      <rect x="16" y="17" width="5" height="4" rx="1" />
    </svg>
  );
}

/** Kept on stage by the viewer's own choice. */
export function PinIcon() {
  return (
    <svg {...base}>
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
      <path d="M12 14v7" />
    </svg>
  );
}

/** The tool shelf in the dock: what the room can bring in besides people. */
export function ToolboxIcon() {
  return (
    <svg {...base}>
      <path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 9V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M3 13h6v2h6v-2h6" />
    </svg>
  );
}

/** The first tool: a screen with a play head, drawn like the others. */
export function YouTubeIcon() {
  return (
    <svg {...base}>
      <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
      <path d="M10.5 9.2v5.6l4.6-2.8z" />
    </svg>
  );
}
