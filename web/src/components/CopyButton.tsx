import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { CheckIcon, CopyIcon } from './icons';

/** How long the tick stays up: long enough to be seen, short enough to forget. */
const CONFIRM_MS = 1600;

/**
 * A copy key that says whether it worked.
 *
 * Copying is the one action in a chat with no visible result — the text goes
 * somewhere the page cannot show — so the button answers for it: the icon
 * becomes a tick and the label becomes "Copied", which is also what a screen
 * reader reads off the focused button. A refusal (an insecure origin where
 * both paths fail) simply leaves the icon alone: nothing was promised.
 */
export default function CopyButton({
  text,
  label,
  doneLabel,
  className = 'chat-tool',
}: {
  /** What lands on the clipboard — the raw markdown, not the rendered text. */
  text: string;
  label: string;
  doneLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  async function run(): Promise<void> {
    if (!(await copyText(text))) {
      return;
    }
    setCopied(true);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
  }

  return (
    <button
      type="button"
      className={className}
      data-copied={copied ? 'true' : undefined}
      aria-label={copied ? doneLabel : label}
      title={copied ? doneLabel : label}
      // The bubble sits under a scrolling list and next to a focused textarea:
      // taking the caret away to copy would cost the reply being written.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void run()}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
