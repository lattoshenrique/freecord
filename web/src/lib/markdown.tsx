/**
 * Markdown de chat — subconjunto pequeno, renderizado como elementos React.
 *
 * Nunca gera HTML a partir do texto do usuário: cada nó é um elemento React,
 * então o conteúdo vira texto por construção. É a defesa contra XSS num campo
 * que qualquer convidado anônimo escreve e todo mundo na sala lê — sem
 * depender de sanitizador nenhum.
 */
import type { ReactNode } from 'react';

/** Só http(s): barra `javascript:` e `data:` vindos do chat. */
function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

function link(href: string, label: ReactNode, key: string): ReactNode {
  const safe = safeHref(href);
  if (!safe) {
    return <span key={key}>{label}</span>;
  }
  return (
    <a key={key} href={safe} target="_blank" rel="noopener noreferrer nofollow">
      {label}
    </a>
  );
}

type Build = (match: RegExpExecArray, key: string) => ReactNode;

/**
 * Ordem importa em dois níveis: código vem primeiro porque suprime qualquer
 * formatação dentro dele, e `**` vem antes de `*` para vencer o empate quando
 * os dois casam na mesma posição.
 */
const INLINE: Array<[RegExp, Build]> = [
  [/`([^`\n]+)`/, (m, key) => <code key={key}>{m[1]}</code>],
  [
    /\[([^\]\n]+)\]\(([^\s)]+)\)/,
    (m, key) => link(m[2]!, parseInline(m[1]!, `${key}l`), key),
  ],
  [/\*\*(\S[^\n]*?)\*\*/, (m, key) => <strong key={key}>{parseInline(m[1]!, `${key}b`)}</strong>],
  [/__(\S[^\n]*?)__/, (m, key) => <strong key={key}>{parseInline(m[1]!, `${key}b`)}</strong>],
  [/~~(\S[^\n]*?)~~/, (m, key) => <del key={key}>{parseInline(m[1]!, `${key}s`)}</del>],
  [/\*(\S[^\n*]*?)\*/, (m, key) => <em key={key}>{parseInline(m[1]!, `${key}i`)}</em>],
  [/(?<![\w_])_(\S[^\n_]*?)_(?![\w_])/, (m, key) => <em key={key}>{parseInline(m[1]!, `${key}i`)}</em>],
  [/(https?:\/\/[^\s<>()]+)/, (m, key) => link(m[1]!, m[1]!, key)],
];

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    let bestIndex = Number.MAX_SAFE_INTEGER;
    let best: { match: RegExpExecArray; build: Build } | null = null;

    for (const [regex, build] of INLINE) {
      const match = regex.exec(rest);
      if (match && match.index < bestIndex) {
        bestIndex = match.index;
        best = { match, build };
      }
    }

    if (!best) {
      out.push(rest);
      break;
    }
    if (bestIndex > 0) {
      out.push(rest.slice(0, bestIndex));
    }
    out.push(best.build(best.match, `${keyPrefix}-${n++}`));
    rest = rest.slice(bestIndex + best.match[0].length);
  }

  return out;
}

/** Parágrafo: quebra simples de linha vira <br>, como todo chat faz. */
function paragraph(lines: string[], key: string): ReactNode {
  const body: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      body.push(<br key={`${key}-br${index}`} />);
    }
    body.push(...parseInline(line, `${key}-${index}`));
  });
  return <p key={key}>{body}</p>;
}

const FENCE = /^```/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBER = /^\d+[.)]\s+(.*)$/;

export function renderMarkdown(source: string): ReactNode[] {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (FENCE.test(line)) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i]!)) {
        code.push(lines[i]!);
        i += 1;
      }
      i += 1; // fecha a cerca (ou acaba o texto)
      blocks.push(
        <pre key={`k${key++}`}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const quoted = QUOTE.exec(line);
    if (quoted) {
      const body: string[] = [];
      while (i < lines.length) {
        const more = QUOTE.exec(lines[i]!);
        if (!more) {
          break;
        }
        body.push(more[1]!);
        i += 1;
      }
      blocks.push(
        <blockquote key={`k${key++}`}>{paragraph(body, `q${key}`)}</blockquote>,
      );
      continue;
    }

    for (const [marker, Tag] of [
      [BULLET, 'ul'],
      [NUMBER, 'ol'],
    ] as const) {
      if (marker.test(line)) {
        const items: string[] = [];
        while (i < lines.length) {
          const item = marker.exec(lines[i]!);
          if (!item) {
            break;
          }
          items.push(item[1]!);
          i += 1;
        }
        blocks.push(
          <Tag key={`k${key++}`}>
            {items.map((item, index) => (
              <li key={index}>{parseInline(item, `li${key}-${index}`)}</li>
            ))}
          </Tag>,
        );
        break;
      }
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const body: string[] = [];
    while (i < lines.length) {
      const current = lines[i]!;
      if (
        current.trim() === '' ||
        FENCE.test(current) ||
        QUOTE.test(current) ||
        BULLET.test(current) ||
        NUMBER.test(current)
      ) {
        break;
      }
      body.push(current);
      i += 1;
    }
    blocks.push(paragraph(body, `k${key++}`));
  }

  return blocks;
}
