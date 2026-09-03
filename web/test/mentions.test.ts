import { describe, expect, it } from 'vitest';
import {
  applyMention,
  canonicalName,
  matchPeople,
  mentionPattern,
  mentionQuery,
  mentionsAnyOf,
} from '../src/lib/mentions';

const room = ['Vega 42', 'Altair 7', 'Ana Lúcia'];

describe('mentionQuery', () => {
  it('opens on an @ at the start of a word, and reports what follows it', () => {
    expect(mentionQuery('oi @veg', 7)).toEqual({ start: 3, query: 'veg' });
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('keeps the query across a space, since a nickname can hold one', () => {
    expect(mentionQuery('oi @Vega 4', 10)).toEqual({ start: 3, query: 'Vega 4' });
  });

  it('is not an address, and does not cross a line break', () => {
    expect(mentionQuery('escreva ana@exemplo.com', 23)).toBeNull();
    expect(mentionQuery('@vega\nsegunda linha', 19)).toBeNull();
  });

  it('reads the caret, not the end of the text', () => {
    // The caret sits right after the "@v"; the rest of the line is not query.
    expect(mentionQuery('@ve depois muita coisa', 3)).toEqual({ start: 0, query: 've' });
  });
});

describe('matchPeople', () => {
  it('ignores case and accents', () => {
    expect(matchPeople('ana lu', room)).toEqual(['Ana Lúcia']);
    expect(matchPeople('VEGA', room)).toEqual(['Vega 42']);
  });

  it('offers everyone on a bare @', () => {
    expect(matchPeople('', room)).toEqual(room);
  });

  it('matches a later word too, but after the ones it names from the start', () => {
    // "42" is a word of "Vega 42"; "Ana" opens a name and comes first.
    expect(matchPeople('a', room)).toEqual(['Altair 7', 'Ana Lúcia']);
    expect(matchPeople('4', room)).toEqual(['Vega 42']);
  });

  it('offers nobody when nobody fits', () => {
    expect(matchPeople('zzz', room)).toEqual([]);
  });
});

describe('applyMention', () => {
  it('replaces the half-typed name and leaves the caret past the space', () => {
    const draft = mentionQuery('oi @veg', 7)!;
    expect(applyMention('oi @veg', draft, 7, 'Vega 42')).toEqual({
      text: 'oi @Vega 42 ',
      caret: 12,
    });
  });

  it('keeps whatever was after the caret', () => {
    const draft = mentionQuery('@ve, tudo bem?', 3)!;
    expect(applyMention('@ve, tudo bem?', draft, 3, 'Vega 42').text).toBe('@Vega 42 , tudo bem?');
  });
});

describe('mentionPattern', () => {
  it('finds only the names the room has', () => {
    expect(mentionsAnyOf('bom dia @Vega 42', room)).toBe(true);
    expect(mentionsAnyOf('bom dia @ninguem', room)).toBe(false);
  });

  it('is not fooled by a longer word or by an address', () => {
    expect(mentionsAnyOf('vamos a @Vega 420', room)).toBe(false);
    expect(mentionsAnyOf('escreva ana@Vega 42', room)).toBe(false);
  });

  it('answers to the same name typed without its accents', () => {
    expect(mentionsAnyOf('oi @Ana Lucia', room)).toBe(true);
  });

  it('prefers the longest name when two of them overlap', () => {
    const two = ['Vega', 'Vega 42'];
    const match = mentionPattern(two)!.exec('oi @Vega 42');
    expect(match?.[1]).toBe('Vega 42');
  });

  it('has nothing to find in an empty room', () => {
    expect(mentionPattern([])).toBeNull();
    expect(mentionsAnyOf('@qualquer', [])).toBe(false);
  });

  it('treats a name with regex punctuation as a name', () => {
    expect(mentionsAnyOf('oi @c++ (dev)', ['c++ (dev)'])).toBe(true);
  });
});

describe('canonicalName', () => {
  it('gives back the spelling its owner chose', () => {
    expect(canonicalName('ana lucia', room)).toBe('Ana Lúcia');
    expect(canonicalName('quem', room)).toBe('quem');
  });
});
