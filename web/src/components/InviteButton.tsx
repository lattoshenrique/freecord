import { useState } from 'react';
import { CheckIcon, LinkIcon } from './icons';

/** Copia o link da sala — o link é o convite. */
export default function InviteButton() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível (http sem TLS, permissão negada)
      window.prompt('Copie o link da sala:', window.location.href);
    }
  }

  return (
    <button
      type="button"
      className={`invite-button ${copied ? 'invite-copied' : ''}`}
      onClick={copyLink}
    >
      {copied ? <CheckIcon /> : <LinkIcon />}
      {copied ? 'Link copiado!' : 'Convidar'}
    </button>
  );
}
