/**
 * Chat markdown — a small subset, rendered as React elements.
 *
 * It never builds HTML out of user text: every node is a React element, so the
 * content becomes text by construction. That is the XSS defence for a field any
 * anonymous guest writes and everyone in the room reads — with no sanitizer to
 * depend on.
 */
import type { ReactNode } from 'react';
import CodeBlock, { type CodeLabels } from '../components/CodeBlock';
import Mention from '../components/Mention';
import { canonicalName, mentionPattern } from './mentions';

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

/**
 * `rules` travels into every build so that formatting nested inside
 * formatting is parsed by the same set — a name in bold is still a
 * mention, and a room's people do not stop existing inside a link label.
 */
type Build = (match: RegExpExecArray, key: string, rules: Rules) => ReactNode;

type Rules = ReadonlyArray<[RegExp, Build]>;

/**
 * Who can be named in this message, and by whom. A mention is only a
 * mention when the room has somebody by that name (lib/mentions.ts), so
 * the rule that finds them is built per render rather than living in the
 * table below — without a room, `@anything` stays the text it was.
 */
export interface MentionContext {
  /** The names present: the writer's own included. */
  names: readonly string[];
  /** The reader's own name, drawn louder when it comes up. */
  self?: string;
}

function mentionRule(context: MentionContext): [RegExp, Build] | null {
  const pattern = mentionPattern(context.names);
  if (!pattern) {
    return null;
  }
  return [
    pattern,
    (match, key) => {
      const name = canonicalName(match[1]!, context.names);
      return <Mention key={key} name={name} self={name === context.self} />;
    },
  ];
}

/**
 * Order matters twice over: code comes first because it suppresses any
 * formatting inside it, and `**` comes before `*` to win the tie when both
 * match at the same position.
 */
const INLINE: Array<[RegExp, Build]> = [
  [/`([^`\n]+)`/, (m, key) => <code key={key}>{m[1]}</code>],
  [
    /\[([^\]\n]+)\]\(([^\s)]+)\)/,
    (m, key, rules) => link(m[2]!, parseInline(m[1]!, `${key}l`, rules), key),
  ],
  [/\*\*(\S[^\n]*?)\*\*/, (m, key, rules) => (
      <strong key={key}>{parseInline(m[1]!, `${key}b`, rules)}</strong>
    )],
  [/__(\S[^\n]*?)__/, (m, key, rules) => (
      <strong key={key}>{parseInline(m[1]!, `${key}b`, rules)}</strong>
    )],
  [/~~(\S[^\n]*?)~~/, (m, key, rules) => (
      <del key={key}>{parseInline(m[1]!, `${key}s`, rules)}</del>
    )],
  [/\*(\S[^\n*]*?)\*/, (m, key, rules) => (
      <em key={key}>{parseInline(m[1]!, `${key}i`, rules)}</em>
    )],
  // A backslashed underscore never opens emphasis. One shrug is the whole
  // reason: `¯\_(ツ)_/¯` is otherwise a perfectly good italic, and the room
  // gets `¯\(ツ)/¯` in slanted type instead of the face it typed.
  [
    /(?<![\w_\\])_(\S[^\n_]*?)_(?![\w_])/,
    (m, key, rules) => (
      <em key={key}>{parseInline(m[1]!, `${key}i`, rules)}</em>
    ),
  ],
  [/(https?:\/\/[^\s<>()]+)/, (m, key) => link(m[1]!, m[1]!, key)],
];

function parseInline(text: string, keyPrefix: string, rules: Rules = INLINE): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    let bestIndex = Number.MAX_SAFE_INTEGER;
    let best: { match: RegExpExecArray; build: Build } | null = null;

    for (const [regex, build] of rules) {
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
    out.push(best.build(best.match, `${keyPrefix}-${n++}`, rules));
    rest = rest.slice(bestIndex + best.match[0].length);
  }

  return out;
}

/** Paragraph: a single line break becomes <br>, as every chat does. */
function paragraph(lines: string[], key: string, rules: Rules): ReactNode {
  const body: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      body.push(<br key={`${key}-br${index}`} />);
    }
    body.push(...parseInline(line, `${key}-${index}`, rules));
  });
  return <p key={key}>{body}</p>;
}

const FENCE = /^```/;
const QUOTE = /^>\s?(.*)$/;
const BULLET = /^[-*+]\s+(.*)$/;
const NUMBER = /^\d+[.)]\s+(.*)$/;

/**
 * `codeLabels` are the two words a code block's copy key needs. They are
 * passed in rather than read from the catalog here, so this module keeps
 * rendering a message with no page, no provider and no translation around it.
 */
export function renderMarkdown(
  source: string,
  codeLabels?: CodeLabels,
  mentions?: MentionContext,
): ReactNode[] {
  // The mention rule goes first: `@` opens nothing else, and a name that
  // happens to contain markdown punctuation is a name, not emphasis.
  const mention = mentions ? mentionRule(mentions) : null;
  const rules: Rules = mention ? [mention, ...INLINE] : INLINE;
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
      blocks.push(<CodeBlock key={`k${key++}`} code={code.join('\n')} labels={codeLabels} />);
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
        <blockquote key={`k${key++}`}>{paragraph(body, `q${key}`, rules)}</blockquote>,
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
              <li key={index}>{parseInline(item, `li${key}-${index}`, rules)}</li>
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
    blocks.push(paragraph(body, `k${key++}`, rules));
  }

  return blocks;
}
