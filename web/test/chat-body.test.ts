import { describe, expect, it } from 'vitest';
import {
  CHAT_BODY_MAX,
  QUOTE_EXCERPT_MAX,
  bodyBudget,
  decodeChatBody,
  encodeChatBody,
  excerptOf,
} from '../src/lib/chat-body';

describe('chat-body', () => {
  it('leaves a plain message untouched', () => {
    expect(encodeChatBody('hello', null)).toBe('hello');
    expect(decodeChatBody('hello')).toEqual({ text: 'hello', quote: null });
  });

  it('round-trips a reply with its quote', () => {
    const quote = { name: 'Ana', text: 'first line' };
    const wire = encodeChatBody('sure!', quote);
    expect(decodeChatBody(wire)).toEqual({ text: 'sure!', quote });
  });

  it('shows a body that only looks like the envelope as typed', () => {
    expect(decodeChatBody('{"q":{oops')).toEqual({ text: '{"q":{oops', quote: null });
    expect(decodeChatBody('{"q":{"n":1},"m":"x"}')).toEqual({
      text: '{"q":{"n":1},"m":"x"}',
      quote: null,
    });
  });

  it('shrinks the excerpt rather than the message to stay within budget', () => {
    const quote = { name: 'Ana', text: 'x'.repeat(140) };
    const text = 'y'.repeat(bodyBudget(quote));
    const wire = encodeChatBody(text, quote);
    expect(wire.length).toBeLessThanOrEqual(CHAT_BODY_MAX);
    expect(decodeChatBody(wire).text).toBe(text);

    const longer = 'y'.repeat(bodyBudget(quote) + 60);
    const squeezed = encodeChatBody(longer, quote);
    expect(squeezed.length).toBeLessThanOrEqual(CHAT_BODY_MAX);
    const decoded = decodeChatBody(squeezed);
    expect(decoded.text).toBe(longer);
    expect(decoded.quote?.text.length).toBeLessThan(140);
  });

  it('excerpts the first meaningful line without its markdown', () => {
    expect(excerptOf('\n\n# **Bold** title\nsecond')).toBe('Bold title');
    expect(excerptOf('> quoted *thing* with [a link](http://x)')).toBe('quoted thing with a link');
    expect(excerptOf('- `code` item')).toBe('code item');
    expect(excerptOf('a'.repeat(200))).toHaveLength(140);
    expect(excerptOf('a'.repeat(200)).endsWith('…')).toBe(true);
  });

  it('clamps what a peer sends, since only the sender\'s composer enforced it', () => {
    // A modified client can put anything inside a sealed envelope: the edge
    // may only accept or drop the whole envelope, never trim the text in it.
    const huge = 'x'.repeat(CHAT_BODY_MAX * 4);
    expect(decodeChatBody(huge).text).toHaveLength(CHAT_BODY_MAX);

    const wire = JSON.stringify({ q: { n: 'a'.repeat(200), t: 'b'.repeat(900) }, m: huge });
    const decoded = decodeChatBody(wire);
    expect(decoded.text).toHaveLength(CHAT_BODY_MAX);
    expect(decoded.quote?.name).toHaveLength(64);
    expect(decoded.quote?.text).toHaveLength(QUOTE_EXCERPT_MAX);
  });
});
