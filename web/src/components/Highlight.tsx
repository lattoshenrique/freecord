import { Fragment } from 'react';
import { segments } from '../lib/chat-search';

/**
 * A message with the search terms marked.
 *
 * While a search is running the bubble shows the text as typed rather than the
 * rendered markdown: a hit inside a link's URL or a code block has to be
 * visible too, and there is no honest way to paint a mark across an element
 * tree that was built from the source. The rendering comes back the moment the
 * search box empties, and nothing about the message itself changed.
 */
export default function Highlight({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {segments(text, terms).map((piece, index) => (
        <Fragment key={index}>
          {piece.hit ? <mark className="chat-hit">{piece.text}</mark> : piece.text}
        </Fragment>
      ))}
    </>
  );
}
