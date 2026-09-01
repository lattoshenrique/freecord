/**
 * Chat markdown — a small subset, rendered as React elements.
 *
 * It never builds HTML out of user text: every node is a React element, so the
 * content becomes text by construction. That is the XSS defence for a field any
 * anonymous guest writes and everyone in the room reads — with no sanitizer to
 * depend on.
 */
import type { ReactNode } from 'react';

/** http(s) only: blocks `javascript:` and `data:` coming from the chat. */
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
 * Order matters twice over: code comes first because it suppresses any
 * formatting inside it, and `**` comes before `*` to win the tie when both
 * match at the same position.
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

/** Paragraph: a single line break becomes <br>, as every chat does. */
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
      i += 1; // close the fence (or run out of text)
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
