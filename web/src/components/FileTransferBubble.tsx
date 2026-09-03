import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { formatBytes, isImageTransfer, type FileTransfer } from '../lib/file-transfer';
import { languageOfFileName } from '../lib/code-detect';
import CodeBlock from './CodeBlock';
import ImageLightbox from './ImageLightbox';
import { DownloadIcon, FileIcon } from './icons';
import './file-preview.css';

/**
 * How much of a code file is shown in the bubble. Enough to recognise what
 * arrived and to copy the top of it; the whole thing is one click away in
 * the file itself, and a chat panel is not a text editor.
 */
const PREVIEW_LINES = 40;
const PREVIEW_BYTES = 16 * 1024;

/**
 * One file in the chat timeline: an offer to accept or decline, a progress
 * bar while bytes move, and a save link once they have all arrived. The
 * bubble sits in the same stream as text messages, on the same side.
 *
 * On the sender's side one bubble stands for the whole batch — the same
 * file offered to everyone in the room — and folds every recipient's state
 * into one line, so a room of eight does not show eight copies.
 */
export default function FileTransferBubble({
  transfers,
  peerName,
  onAccept,
  onDecline,
  onCancel,
  onDismiss,
}: {
  /** One transfer, or every copy of one outgoing batch. Never empty. */
  transfers: FileTransfer[];
  /** Display name for a peer id (sender or recipient). */
  peerName: (peerId: string) => string;
  onAccept: (key: string) => void;
  onDecline: (key: string) => void;
  onCancel: (key: string) => void;
  onDismiss: (key: string) => void;
}) {
  const { t, locale } = useI18n();
  const transfer = transfers[0]!;
  const mine = transfer.direction === 'out';
  const [previewOpen, setPreviewOpen] = useState(false);

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

  // The batch as one state: bytes and counts across every copy.
  const total = transfers.length;
  const done = transfers.filter((item) => item.status === 'done').length;
  const declined = transfers.filter((item) => item.status === 'declined').length;
  const live = transfers.filter((item) => item.status === 'pending' || item.status === 'active');
  const active = transfers.some((item) => item.status === 'active');
  const bytes = transfers.reduce((sum, item) => sum + item.bytes, 0);
  const percent = transfer.size === 0 ? 100 : Math.floor((bytes / (transfer.size * total)) * 100);
  const settled = live.length === 0;

  let status: string;
  if (mine && total > 1) {
    // Several recipients: a tally, not one person's state.
    if (settled && done === total) {
      status = t('file.status.sent');
    } else if (settled && transfers.every((item) => item.status === 'failed')) {
      status = t('file.status.failed');
    } else {
      const parts = [t('file.status.summary', { done, total })];
      if (declined > 0) {
        parts.push(t('file.status.declinedCount', { count: declined }));
      }
      status = parts.join(' · ');
    }
  } else {
    const who = peerName(transfer.peerId);
    switch (transfer.status) {
      case 'pending':
        status = mine ? t('file.status.pending', { name: who }) : t('file.offer', { name: who });
        break;
      case 'active':
        status = mine ? t('file.status.sending', { percent }) : t('file.status.receiving', { percent });
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
  }

  // An image previews inline as soon as its bytes are here: from the start
  // for the sender, on completion for the receiver. Click for the real size.
  const preview = href && isImageTransfer(transfer) ? href : null;

  // A code file previews the same way, in the same viewer a fenced message
  // uses — which is the point: a snippet too long to be a message should not
  // arrive as a nameless attachment nobody opens. The language comes off the
  // extension the sender's paste chose (lib/code-detect.ts).
  const codeLanguage = languageOfFileName(transfer.name);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const blob = transfer.blob;
    if (!blob || !codeLanguage) {
      setCode(null);
      return;
    }
    let alive = true;
    void blob
      .slice(0, PREVIEW_BYTES)
      .text()
      .then((text) => {
        if (!alive) {
          return;
        }
        const lines = text.split('\n');
        const head = lines.slice(0, PREVIEW_LINES).join('\n');
        setCode(lines.length > PREVIEW_LINES || blob.size > PREVIEW_BYTES ? `${head}\n…` : head);
      })
      .catch(() => {
        // The bytes are on disk either way; the bubble simply shows no preview.
      });
    return () => {
      alive = false;
    };
  }, [transfer.blob, codeLanguage]);
  const batchStatus = settled ? (done === total ? 'done' : transfer.status) : active ? 'active' : 'pending';

  return (
    <div
      className={`chat-bubble chat-file ${mine ? 'mine' : ''} file-${batchStatus}`}
      data-transfer={transfer.key}
      data-batch-size={total}
    >
      {!mine && <span className="chat-author">{peerName(transfer.peerId)}</span>}
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
            {mine && (
              <>
                {' · '}
                {total > 1
                  ? t('file.toMany', { count: total })
                  : t('file.to', { name: peerName(transfer.peerId) })}
              </>
            )}
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
      {code && (
        <div className="chat-file-code">
          <CodeBlock
            code={code}
            language={codeLanguage ?? undefined}
            labels={{ copy: t('chat.copyCode'), copied: t('chat.copied') }}
          />
        </div>
      )}
      {preview && previewOpen && (
        <ImageLightbox src={preview} name={transfer.name} onClose={() => setPreviewOpen(false)} />
      )}
      {active && (
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
        {live.length > 0 && (mine || transfer.status === 'active') && (
          <button
            type="button"
            className="chat-file-btn"
            onClick={() => live.forEach((item) => onCancel(item.key))}
          >
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
          <button
            type="button"
            className="chat-file-btn quiet"
            onClick={() => transfers.forEach((item) => onDismiss(item.key))}
          >
            {t('file.dismiss')}
          </button>
        )}
      </div>
    </div>
  );
}
