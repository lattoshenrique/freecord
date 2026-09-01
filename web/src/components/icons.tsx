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

export function SlidersIcon() {
  return (
    <svg {...base}>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <circle cx="15" cy="8" r="2.2" />
      <circle cx="9" cy="16" r="2.2" />
    </svg>
  );
}
