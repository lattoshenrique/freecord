import { describe, expect, it } from 'vitest';
import {
  CHAT_BODY_MAX,
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
});
