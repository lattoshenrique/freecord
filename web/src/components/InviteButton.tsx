import { useState } from 'react';
import { useI18n } from '../i18n';
import { CheckIcon, LinkIcon } from './icons';

/** Copies the room link — the link is the invite. */
export default function InviteButton() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (plain http, permission denied)
      window.prompt(t('invite.manualCopy'), window.location.href);
    }
  }

  return (
    <button
      type="button"
      className={`control control-invite ${copied ? 'invite-copied' : ''}`}
      // The word is hidden on a narrow dock; the name must not go with it.
      aria-label={copied ? t('invite.copied') : t('invite.copy')}
      onClick={copyLink}
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
      {/* Announced when it changes to "copied", eyes on the page or not. */}
      <span className="control-label" aria-live="polite">
        {copied ? t('invite.copied') : t('invite.copy')}
      </span>
    </button>
  );
}
