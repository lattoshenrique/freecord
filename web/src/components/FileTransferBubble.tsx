import { useEffect, useMemo } from 'react';
import { useI18n } from '../i18n';
import { formatBytes, type FileTransfer } from '../lib/file-transfer';
import { DownloadIcon, FileIcon } from './icons';

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
  const percent = transfer.size === 0 ? 100 : Math.floor((transfer.bytes / transfer.size) * 100);

  // The blob URL lives exactly as long as the bubble that offers it.
  const href = useMemo(
    () => (transfer.blob ? URL.createObjectURL(transfer.blob) : null),
    [transfer.blob],
  );
  useEffect(() => {
    return () => {
      if (href) {
        URL.revokeObjectURL(href);
      }
    };
  }, [href]);

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
        {href && (
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
