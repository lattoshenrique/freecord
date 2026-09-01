/**
 * Transformações de markdown sobre texto + seleção.
 *
 * Lógica pura de propósito: a barra de formatação e os atalhos só chamam
 * `applyMarkdown` e devolvem o resultado ao textarea. Isso deixa o
 * comportamento chato (alternar, expandir para linhas inteiras, renumerar)
 * testável sem DOM.
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

const WRAPPERS: Record<WrapAction, { marker: string; placeholder: string }> = {
  bold: { marker: '**', placeholder: 'negrito' },
  italic: { marker: '*', placeholder: 'itálico' },
  code: { marker: '`', placeholder: 'código' },
  strike: { marker: '~~', placeholder: 'riscado' },
};

/** Envolve, ou desfaz se já estiver envolvido (dentro ou fora da seleção). */
function wrap(state: EditState, marker: string, placeholder: string): EditState {
  const { text, start, end } = state;
  const selected = text.slice(start, end);
  const size = marker.length;

  // Marcadores dentro da seleção: **exemplo** selecionado por inteiro.
  if (selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(size, -size);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      start,
      end: start + inner.length,
    };
  }

  // Marcadores fora da seleção: apenas `exemplo` selecionado, entre marcadores.
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
    // Sem seleção, deixa o texto de exemplo selecionado para digitar por cima.
    start: start + size,
    end: start + size + body.length,
  };
}

/** Cresce a seleção até cobrir as linhas inteiras que ela toca. */
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
  // Já formatado por inteiro: o clique desfaz.
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

function insertLink(state: EditState): EditState {
  const { text, start, end } = state;
  const selected = text.slice(start, end);
  const isUrl = /^https?:\/\/\S+$/.test(selected);
  const label = isUrl ? 'texto' : selected || 'texto';
  const href = isUrl ? selected : 'https://';
  const built = `[${label}](${href})`;
  // Cursor no pedaço que ainda falta preencher.
  const target = isUrl ? { from: 1, length: label.length } : { from: label.length + 3, length: href.length };
  return {
    text: text.slice(0, start) + built + text.slice(end),
    start: start + target.from,
    end: start + target.from + target.length,
  };
}

function isWrap(action: MarkdownAction): action is WrapAction {
  return action in WRAPPERS;
}

export function applyMarkdown(state: EditState, action: MarkdownAction): EditState {
  if (isWrap(action)) {
    const { marker, placeholder } = WRAPPERS[action];
    return wrap(state, marker, placeholder);
  }
  if (action === 'link') {
    return insertLink(state);
  }
  return prefixLines(state, action);
}
