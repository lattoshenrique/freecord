/**
 * Markdown transforms over text + selection.
 *
 * Pure on purpose: the toolbar and the shortcuts only call `applyMarkdown` and
 * hand the result back to the textarea. That keeps the fiddly behaviour
 * (toggling, growing to whole lines, renumbering) testable without a DOM.
 *
 * Placeholders come in already translated — this module holds no user text.
 */

export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'code'
  | 'strike'
  | 'link'
  | 'bullet'
  | 'number'
  | 'quote';

export interface EditState {
  text: string;
  start: number;
  end: number;
}

type WrapAction = 'bold' | 'italic' | 'code' | 'strike';

/** User-visible sample text, translated by the caller. */
export type Placeholders = Record<WrapAction | 'linkLabel', string>;

const MARKERS: Record<WrapAction, string> = {
  bold: '**',
  italic: '*',
  code: '`',
  strike: '~~',
};

/** Wraps, or unwraps when already wrapped (inside or outside the selection). */
function wrap(state: EditState, marker: string, placeholder: string): EditState {
  const { text, start, end } = state;
  const selected = text.slice(start, end);
  const size = marker.length;

  // Markers inside the selection: the whole **example** is selected.
  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(size, -size);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      start,
      end: start + inner.length,
    };
  }

  // Markers outside it: only `example` is selected, sitting between markers.
  if (text.slice(start - size, start) === marker && text.slice(end, end + size) === marker) {
    return {
      text: text.slice(0, start - size) + selected + text.slice(end + size),
      start: start - size,
      end: end - size,
    };
  }

  const body = selected || placeholder;
  return {
    text: text.slice(0, start) + marker + body + marker + text.slice(end),
    // With nothing selected, leave the sample selected so typing replaces it.
    start: start + size,
    end: start + size + body.length,
  };
}

/** Grows the selection to cover the whole lines it touches. */
function lineBounds(text: string, start: number, end: number): { from: number; to: number } {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  return { from, to: lineEnd === -1 ? text.length : lineEnd };
}

const PREFIXED = {
  bullet: /^- /,
  quote: /^> /,
  number: /^\d+\. /,
};

function prefixLines(state: EditState, action: 'bullet' | 'number' | 'quote'): EditState {
  const { text } = state;
  const { from, to } = lineBounds(text, state.start, state.end);
  const lines = text.slice(from, to).split('\n');
  const pattern = PREFIXED[action];
  const meaningful = lines.filter((line) => line.trim() !== '');
  // Already fully formatted: the click undoes it.
  const remove = meaningful.length > 0 && meaningful.every((line) => pattern.test(line));

  const changed = lines.map((line, index) => {
    if (remove) {
      return line.replace(pattern, '');
    }
    if (line.trim() === '') {
      return line;
    }
    const clean = line.replace(PREFIXED.bullet, '').replace(PREFIXED.quote, '').replace(PREFIXED.number, '');
    if (action === 'bullet') {
      return `- ${clean}`;
    }
    if (action === 'quote') {
      return `> ${clean}`;
    }
    return `${index + 1}. ${clean}`;
  });

  const body = changed.join('\n');
  return { text: text.slice(0, from) + body + text.slice(to), start: from, end: from + body.length };
}

function insertLink(state: EditState, linkLabel: string): EditState {
  const { text, start, end } = state;
  const selected = text.slice(start, end);
  const isUrl = /^https?:\/\/\S+$/.test(selected);
  const label = isUrl ? linkLabel : selected || linkLabel;
  const href = isUrl ? selected : 'https://';
  const built = `[${label}](${href})`;
  // Select whatever still needs filling in.
  const target = isUrl ? { from: 1, length: label.length } : { from: label.length + 3, length: href.length };
  return {
    text: text.slice(0, start) + built + text.slice(end),
    start: start + target.from,
    end: start + target.from + target.length,
  };
}

function isWrap(action: MarkdownAction): action is WrapAction {
  return action in MARKERS;
}

export function applyMarkdown(
  state: EditState,
  action: MarkdownAction,
  placeholders: Placeholders,
): EditState {
  if (isWrap(action)) {
    return wrap(state, MARKERS[action], placeholders[action]);
  }
  if (action === 'link') {
    return insertLink(state, placeholders.linkLabel);
  }
  return prefixLines(state, action);
}
