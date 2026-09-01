import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import { CloseIcon } from './icons';

/**
 * Full-size view of an image from the chat. The picture is shown at its
 * natural size — panning by scroll when it is larger than the viewport —
 * because "see it for real" is the point; the bubble already had the fit.
 *
 * Rendered through a portal: the chat panel animates in with a transform,
 * which would turn a fixed overlay into a panel-local one.
 */
export default function ImageLightbox({
  src,
  name,
  onClose,
}: {
  src: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // The viewer owns the keyboard while open: Escape closes it, and no
    // key falls through to the room's shortcuts (M, V, S, Q, C).
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function onBackdropClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onKeyDown={onKeyDown}
      onClick={onBackdropClick}
    >
      <button
        ref={closeRef}
        type="button"
        className="lightbox-close"
        aria-label={t('file.closePreview')}
        onClick={onClose}
      >
        <CloseIcon />
      </button>
      <figure className="lightbox-figure" onClick={onBackdropClick}>
        <img src={src} alt={name} className="lightbox-image" />
        <figcaption className="lightbox-caption">{name}</figcaption>
      </figure>
    </div>,
    document.body,
  );
}
