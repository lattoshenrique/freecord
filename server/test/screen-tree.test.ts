import { describe, expect, it } from 'vitest';
import { SCREEN_FANOUT, computeScreenTree } from '../src/domain/screen-tree.js';

describe('computeScreenTree', () => {
  it('sozinho: só o sharer, sem filhos', () => {
    const tree = computeScreenTree('s', ['s']);
    expect(tree.get('s')).toEqual({ children: [], parentId: null });
    expect(tree.size).toBe(1);
  });

  it('até o fanout, todos são filhos diretos do sharer', () => {
    const tree = computeScreenTree('s', ['s', 'a', 'b', 'c']);
    expect(tree.get('s')!.children).toEqual(['a', 'b', 'c']);
    for (const id of ['a', 'b', 'c']) {
      expect(tree.get(id)).toEqual({ children: [], parentId: 's' });
    }
  });

  it('acima do fanout, os primeiros viram relays — ninguém envia mais que o fanout', () => {
    const ids = ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'g']; // sala cheia (8)
    const tree = computeScreenTree('s', ids);
    expect(tree.size).toBe(8);
    let leaves = 0;
    for (const [id, route] of tree) {
      expect(route.children.length).toBeLessThanOrEqual(SCREEN_FANOUT);
      if (route.children.length === 0) {
        leaves += 1;
      }
      for (const child of route.children) {
        expect(tree.get(child)!.parentId).toBe(id);
      }
    }
    expect(tree.get('s')!.children).toEqual(['a', 'b', 'c']);
    // 7 espectadores, 3 diretos: 4 ficam sob relays — profundidade máxima 2.
    expect(tree.get('a')!.children).toEqual(['d', 'e', 'f']);
    expect(tree.get('b')!.children).toEqual(['g']);
    expect(leaves).toBe(5);
  });

  it('é determinística: independe da ordem de entrada dos pares', () => {
    const shuffled = computeScreenTree('s', ['g', 'c', 's', 'a', 'f', 'b', 'e', 'd']);
    const sorted = computeScreenTree('s', ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect([...shuffled.entries()]).toEqual([...sorted.entries()]);
  });

  it('ignora o sharer na lista de espectadores', () => {
    const tree = computeScreenTree('s', ['a', 's', 'b']);
    expect(tree.get('s')!.children).toEqual(['a', 'b']);
  });
});
