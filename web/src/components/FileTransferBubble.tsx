import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { formatBytes, isImageTransfer, type FileTransfer } from '../lib/file-transfer';
import ImageLightbox from './ImageLightbox';
import { DownloadIcon, FileIcon } from './icons';
import './file-preview.css';

/**
 * One file in the chat timeline: an offer to accept or decline, a progress
 * bar while bytes move, and a save link once they have all arrived. The
 * bubble sits in the same stream as text messages, on the same side.
 */
export default function FileTransferBubble({
  transfer,
  peerName,
  onAccept,
  onDecline,
  onCancel,
  onDismiss,
}: {
  transfer: FileTransfer;
  /** Display name of the other side (sender or recipient). */
  peerName: string;
  onAccept: (key: string) => void;
  onDecline: (key: string) => void;
  onCancel: (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  const { t, locale } = useI18n();
  const mine = transfer.direction === 'out';
  const [previewOpen, setPreviewOpen] = useState(false);
  const percent = transfer.size === 0 ? 100 : Math.floor((transfer.bytes / transfer.size) * 100);

  // The blob URL is created and revoked in the same effect, so a re-run
  // (StrictMode mounts twice in dev) makes a fresh URL instead of keeping a
  // memoized one that the cleanup already revoked — the sender's own image
  // used to show up broken for exactly that reason.
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!transfer.blob) {
      setHref(null);
      return;
    }
    const url = URL.createObjectURL(transfer.blob);
    setHref(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [transfer.blob]);

  let status: string;
  switch (transfer.status) {
    case 'pending':
      status = mine ? t('file.status.pending', { name: peerName }) : t('file.offer', { name: peerName });
      break;
    case 'active':
      status = mine
        ? t('file.status.sending', { percent })
        : t('file.status.receiving', { percent });
      break;
    case 'done':
      status = mine ? t('file.status.sent') : t('file.status.received');
      break;
    case 'declined':
      status = t('file.status.declined');
      break;
    case 'cancelled':
      status = t('file.status.cancelled');
      break;
    case 'failed':
      status = t('file.status.failed');
      break;
  }

  const settled = transfer.status !== 'pending' && transfer.status !== 'active';
  // An image previews inline as soon as its bytes are here: from the start
  // for the sender, on completion for the receiver. Click for the real size.
  const preview = href && isImageTransfer(transfer) ? href : null;

  return (
    <div
      className={`chat-bubble chat-file ${mine ? 'mine' : ''} file-${transfer.status}`}
      data-transfer={transfer.key}
    >
      {!mine && <span className="chat-author">{peerName}</span>}
      <div className="chat-file-row">
        <span className="chat-file-icon" aria-hidden="true">
          <FileIcon />
        </span>
        <div className="chat-file-meta">
          <span className="chat-file-name" title={transfer.name}>
            {transfer.name}
          </span>
          <span className="chat-file-size">
            {formatBytes(transfer.size, locale)}
            {mine && <> · {t('file.to', { name: peerName })}</>}
          </span>
        </div>
      </div>
      {preview && (
        <button
          type="button"
          className="chat-file-thumb"
          title={t('file.preview')}
          aria-label={t('file.preview')}
          onClick={() => setPreviewOpen(true)}
        >
          <img src={preview} alt={transfer.name} loading="lazy" />
        </button>
      )}
      {preview && previewOpen && (
        <ImageLightbox src={preview} name={transfer.name} onClose={() => setPreviewOpen(false)} />
      )}
      {transfer.status === 'active' && (
        <div
          className="chat-file-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="chat-file-status">{status}</p>
      <div className="chat-file-actions">
        {!mine && transfer.status === 'pending' && (
          <>
            <button type="button" className="chat-file-btn primary" onClick={() => onAccept(transfer.key)}>
              {t('file.accept')}
            </button>
            <button type="button" className="chat-file-btn" onClick={() => onDecline(transfer.key)}>
              {t('file.decline')}
            </button>
          </>
        )}
        {(transfer.status === 'active' || (mine && transfer.status === 'pending')) && (
          <button type="button" className="chat-file-btn" onClick={() => onCancel(transfer.key)}>
            {t('file.cancel')}
          </button>
        )}
        {href && !mine && (
          <a className="chat-file-btn primary" href={href} download={transfer.name}>
            <DownloadIcon />
            {t('file.save')}
          </a>
        )}
        {settled && (
          <button type="button" className="chat-file-btn quiet" onClick={() => onDismiss(transfer.key)}>
            {t('file.dismiss')}
          </button>
        )}
      </div>
    </div>
  );
}
