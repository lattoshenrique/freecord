import { useEffect, useState } from 'react';
import { languageLabel, loadHighlighter } from '../lib/code-detect';
import CopyButton from './CopyButton';

/** The two words a code block needs to offer its copy key. */
export interface CodeLabels {
  copy: string;
  copied: string;
}

/**
 * Colours for a block of code, once the parser has arrived.
 *
 * The block renders as plain text first and repaints when the chunk lands
 * (lib/code-detect.ts imports it lazily). That order is the point: the code
 * is readable in the first frame on a slow link, and nothing in the layout
 * moves when the colours appear. A parser that fails to load is not an
 * error anybody needs to hear about — the code is already on screen.
 */
function useHighlighted(code: string, language?: string): string | null {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setHtml(null);
    loadHighlighter()
      .then((parser) => {
        if (alive) {
          setHtml(parser.markup(code, language));
        }
      })
      .catch(() => {
        // Plain text it stays.
      });
    return () => {
      alive = false;
    };
  }, [code, language]);
  return html;
}

/**
 * A fenced code block: the chat's code viewer.
 *
 * It has the one affordance a code block in a chat is for — getting the
 * thing out again — plus colours and, when the language is known, its name
 * in the corner. Selecting code by hand means dragging across a scrolling
 * list on a narrow panel, and on a phone it means fighting the selection
 * handles, which is why a command someone pasted so often gets retyped.
 *
 * Without labels (a caller that is not the chat) it renders the bare block,
 * so `renderMarkdown` stays usable outside a translated page.
 */
export default function CodeBlock({
  code,
  language,
  labels,
}: {
  code: string;
  /** A highlight.js id, from the fence's info word. Absent = let it guess. */
  language?: string;
  labels?: CodeLabels;
}) {
  const html = useHighlighted(code, language);
  // The markup comes from highlight.js and from nowhere else: it escapes
  // every character of `code` and emits only its own spans. Nothing is
  // concatenated onto it here — see the note on `markup` in lib/highlight.ts.
  const body = html ? (
    <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <code className="hljs">{code}</code>
  );

  if (!labels) {
    return <pre>{body}</pre>;
  }
  const label = language ? languageLabel(language) : null;
  return (
    <div className="chat-code" data-language={language || undefined}>
      {label && <span className="chat-code-lang">{label}</span>}
      <pre>{body}</pre>
      <CopyButton
        text={code}
        label={labels.copy}
        doneLabel={labels.copied}
        className="chat-code-copy"
      />
    </div>
  );
}
