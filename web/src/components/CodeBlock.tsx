import CopyButton from './CopyButton';

/** The two words a code block needs to offer its copy key. */
export interface CodeLabels {
  copy: string;
  copied: string;
}

/**
 * A fenced code block, with the one affordance a code block in a chat is for:
 * getting the thing out again. Selecting it by hand means dragging across a
 * scrolling list on a narrow panel, and on a phone it means fighting the text
 * selection handles — which is why a command someone pasted so often gets
 * retyped instead.
 *
 * Without labels (a caller that is not the chat) it renders the bare block, so
 * `renderMarkdown` stays usable outside a translated page.
 */
export default function CodeBlock({ code, labels }: { code: string; labels?: CodeLabels }) {
  if (!labels) {
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div className="chat-code">
      <pre>
        <code>{code}</code>
      </pre>
      <CopyButton
        text={code}
        label={labels.copy}
        doneLabel={labels.copied}
        className="chat-code-copy"
      />
    </div>
  );
}
