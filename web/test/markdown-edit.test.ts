import { describe, expect, it } from 'vitest';
import { applyMarkdown, type EditState, type Placeholders } from '../src/lib/markdown-edit';

const at = (text: string, start: number, end = start): EditState => ({ text, start, end });

const PLACEHOLDERS: Placeholders = {
  bold: 'bold',
  italic: 'italic',
  code: 'code',
  strike: 'strike',
  linkLabel: 'text',
};

const apply = (state: EditState, action: Parameters<typeof applyMarkdown>[1]) =>
  applyMarkdown(state, action, PLACEHOLDERS);

describe('applyMarkdown', () => {
  it('wraps the selection', () => {
    expect(apply(at('oi mundo', 3, 8), 'bold')).toEqual({
      text: 'oi **mundo**',
      start: 5,
      end: 10,
    });
  });

  it('with no selection, inserts a sample that is already selected', () => {
    const result = apply(at('', 0), 'italic');
    expect(result.text).toBe('*italic*');
    expect(result.text.slice(result.start, result.end)).toBe('italic');
  });

  it('toggles off, with the marker inside or outside the selection', () => {
    expect(apply(at('**forte**', 0, 9), 'bold').text).toBe('forte');
    expect(apply(at('**forte**', 2, 7), 'bold')).toEqual({
      text: 'forte',
      start: 0,
      end: 5,
    });
  });

  it('does not confuse bold with italic when toggling off', () => {
    expect(apply(at('*it*', 0, 4), 'italic').text).toBe('it');
    expect(apply(at('~~ruim~~', 0, 8), 'strike').text).toBe('ruim');
  });

  it('a list covers every touched line, even on a partial selection', () => {
    const result = apply(at('um\ndois\ntrês', 1, 6), 'bullet');
    expect(result.text).toBe('- um\n- dois\ntrês');
  });

  it('an ordered list renumbers, and toggling removes it', () => {
    const numbered = apply(at('um\ndois', 0, 7), 'number');
    expect(numbered.text).toBe('1. um\n2. dois');
    expect(apply(at(numbered.text, 0, numbered.text.length), 'number').text).toBe('um\ndois');
  });

  it('swaps one list type for another without stacking markers', () => {
    const bullets = apply(at('um\ndois', 0, 7), 'bullet').text;
    expect(apply(at(bullets, 0, bullets.length), 'quote').text).toBe('> um\n> dois');
  });

  it('a quote skips blank lines in the middle', () => {
    expect(apply(at('um\n\ndois', 0, 8), 'quote').text).toBe('> um\n\n> dois');
  });

  it('link: the selection becomes the label and the URL is selected to paste over', () => {
    const result = apply(at('veja aqui', 5, 9), 'link');
    expect(result.text).toBe('veja [aqui](https://)');
    expect(result.text.slice(result.start, result.end)).toBe('https://');
  });

  it('link: a selected URL becomes the target and the label is left to type', () => {
    const result = apply(at('https://a.dev', 0, 13), 'link');
    expect(result.text).toBe('[text](https://a.dev)');
    expect(result.text.slice(result.start, result.end)).toBe('text');
  });
});
