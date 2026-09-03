import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { copyText } from '../lib/clipboard';
import { MOTION, usePresence } from '../lib/motion';
import { CheckIcon, LinkIcon } from './icons';
import InvitePanel from './InvitePanel';

/** Copies the room link and opens its visual handoff — the link is the invite. */
export default function InviteButton() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { mounted, leaving } = usePresence(open, MOTION.panel);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) {
        clearTimeout(copyTimer.current);
      }
    },
    [],
  );

  async function copyLink(url: string): Promise<void> {
    const didCopy = await copyText(url);
    if (didCopy) {
      setCopied(true);
      if (copyTimer.current !== null) {
        clearTimeout(copyTimer.current);
      }
      copyTimer.current = setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, 2000);
      return;
    }
    setCopied(false);
  }

  function shareRoom(): void {
    // Read this at the click, not at mount: the fragment carries the sealed
    // chat key and can change when a deep link routes an already-open app.
    const url = window.location.href;
    setInviteUrl(url);
    setOpen(true);
    void copyLink(url);
  }

  return (
    <>
      <button
        type="button"
        className={`control control-invite ${copied ? 'invite-copied' : ''}`}
        // The word is hidden on a narrow dock; the name must not go with it.
        aria-label={copied ? t('invite.copied') : t('invite.copy')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={shareRoom}
      >
        {copied ? <CheckIcon /> : <LinkIcon />}
        {/* Announced when it changes to "copied", eyes on the page or not. */}
        <span className="control-label" aria-live="polite">
          {copied ? t('invite.copied') : t('invite.copy')}
        </span>
      </button>
      {mounted && inviteUrl ? (
        <InvitePanel
          url={inviteUrl}
          copied={copied}
          leaving={leaving}
          onCopy={() => void copyLink(inviteUrl)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
