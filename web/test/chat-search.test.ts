import { describe, expect, it } from 'vitest';
import { fold, matches, queryTerms, segments } from '../src/lib/chat-search';

const text = (query: string) => queryTerms(query);

describe('chat-search', () => {
  it('folds case and accents, keeping a way back to the original', () => {
    const folded = fold('Você');
    expect(folded.value).toBe('voce');
    // 'c' of the folded text is the 'c' of the original, accent and all.
    expect(folded.index[folded.value.indexOf('c')]).toBe(2);
    expect(folded.index[folded.value.length]).toBe('Você'.length);
  });

  it('matches without accents or case, in any order', () => {
    expect(matches(['Você viu o link?', 'Ana'], text('voce LINK'))).toBe(true);
    expect(matches(['Você viu o link?', 'Ana'], text('link ana'))).toBe(true);
    expect(matches(['Você viu o link?', 'Ana'], text('link bruno'))).toBe(false);
  });

  it('takes an empty query as no filter at all', () => {
    expect(queryTerms('   ')).toEqual([]);
    expect(matches(['anything'], [])).toBe(true);
  });

  it('marks every hit and leaves the rest alone', () => {
    expect(segments('deploy at noon, deploy again', text('deploy'))).toEqual([
      { text: 'deploy', hit: true },
      { text: ' at noon, ', hit: false },
      { text: 'deploy', hit: true },
      { text: ' again', hit: false },
    ]);
  });

  it('marks the accented original when the query has no accent', () => {
    expect(segments('Você', text('voce'))).toEqual([{ text: 'Você', hit: true }]);
    expect(segments('na sessão de hoje', text('sessao'))).toEqual([
      { text: 'na ', hit: false },
      { text: 'sessão', hit: true },
      { text: ' de hoje', hit: false },
    ]);
  });

  it('merges overlapping terms into one run instead of nesting them', () => {
    expect(segments('banana', text('ban anana'))).toEqual([{ text: 'banana', hit: true }]);
  });

  it('returns the whole text untouched when nothing matches', () => {
    expect(segments('hello', text('bye'))).toEqual([{ text: 'hello', hit: false }]);
    expect(segments('hello', [])).toEqual([{ text: 'hello', hit: false }]);
    expect(segments('', text('x'))).toEqual([{ text: '', hit: false }]);
  });
});
