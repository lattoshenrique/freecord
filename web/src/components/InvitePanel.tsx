import { useEffect, useId, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { correction, generate } from 'lean-qr';
import { toSvgPath } from 'lean-qr/extras/svg';
import { useI18n } from '../i18n';
import { CheckIcon, CloseIcon, CopyIcon } from './icons';
import './invite.css';

const QR_PADDING = 4;
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

function RoomQr({ url, label }: { url: string; label: string }) {
  const gradientSuffix = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const modulesGradientId = `invite-qr-modules-${gradientSuffix}`;
  const logoGradientId = `invite-qr-logo-${gradientSuffix}`;
  const qr = useMemo(() => {
    // The logo intentionally covers a small part of the matrix. Level H
    // leaves enough recovery capacity for scanners to reconstruct it.
    const code = generate(url, {
      minCorrectionLevel: correction.H,
      maxCorrectionLevel: correction.H,
    });
    const logoSize = code.size * 0.22;
    return {
      path: toSvgPath(code),
      size: code.size + QR_PADDING * 2,
      logoSize,
      logoOffset: (code.size - logoSize) / 2,
      logoScale: logoSize / 64,
    };
  }, [url]);

  return (
    <svg
      className="invite-qr"
      viewBox={`${-QR_PADDING} ${-QR_PADDING} ${qr.size} ${qr.size}`}
      role="img"
      aria-label={label}
      data-qr-content={url}
      data-error-correction="H"
      shapeRendering="crispEdges"
    >
      <defs>
        <linearGradient id={modulesGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2836a8" />
          <stop offset="1" stopColor="#6b218f" />
        </linearGradient>
        <linearGradient id={logoGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7180ff" />
          <stop offset="1" stopColor="#c076ff" />
        </linearGradient>
      </defs>
      <rect
        x={-QR_PADDING}
        y={-QR_PADDING}
        width={qr.size}
        height={qr.size}
        fill="#fff"
      />
      <path d={qr.path} fill={`url(#${modulesGradientId})`} />

      <g
        className="invite-qr-logo"
        data-qr-logo="true"
        transform={`translate(${qr.logoOffset} ${qr.logoOffset}) scale(${qr.logoScale})`}
        shapeRendering="geometricPrecision"
      >
        <rect width="64" height="64" rx="14" fill="#11141c" stroke="#fff" strokeWidth="4" />
        <g transform="translate(8 8) scale(0.75)">
          <path
            d="M40.1 14.4 49.5 49.5 14.4 40.1Z"
            fill="none"
            stroke={`url(#${logoGradientId})`}
            strokeWidth="7"
            strokeLinejoin="round"
          />
          <circle cx="40.1" cy="14.4" r="8.5" fill={`url(#${logoGradientId})`} />
          <circle cx="49.5" cy="49.5" r="8.5" fill={`url(#${logoGradientId})`} />
          <circle cx="14.4" cy="40.1" r="8.5" fill={`url(#${logoGradientId})`} />
        </g>
      </g>
    </svg>
  );
}

interface InvitePanelProps {
  url: string;
  copied: boolean;
  leaving: boolean;
  onCopy: () => void;
  onClose: () => void;
}

/** A local-only QR handoff: the room key never leaves this browser to render it. */
export default function InvitePanel({
  url,
  copied,
  leaving,
  onCopy,
  onClose,
}: InvitePanelProps) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const linkId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // A modal owns room shortcuts while it is open.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === panelRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onBackdropClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return createPortal(
    <div
      className="invite-backdrop"
      data-leaving={leaving ? 'true' : undefined}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        className="invite-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-leaving={leaving ? 'true' : undefined}
        onKeyDown={onKeyDown}
      >
        <button
          type="button"
          className="invite-panel-dismiss"
          aria-label={t('invite.close')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>

        <header className="invite-panel-header">
          <h2 id={titleId}>{t('invite.panelTitle')}</h2>
          <p id={descriptionId}>{t('invite.panelLead')}</p>
        </header>

        <div className="invite-qr-frame">
          <RoomQr url={url} label={t('invite.qrAlt')} />
        </div>

        <div className="invite-link-field">
          <label htmlFor={linkId}>{t('invite.linkLabel')}</label>
          <div className="invite-link-row">
            <input
              id={linkId}
              type="text"
              value={url}
              readOnly
              spellCheck={false}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className={copied ? 'invite-copy-again is-copied' : 'invite-copy-again'}
              onClick={onCopy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              <span aria-live="polite">
                {copied ? t('invite.linkCopied') : t('invite.copyLink')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
