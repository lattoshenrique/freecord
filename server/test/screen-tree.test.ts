import { describe, expect, it } from 'vitest';
import { SCREEN_FANOUT, computeScreenTree } from '../src/domain/screen-tree.js';

describe('computeScreenTree', () => {
  it('alone: just the sharer, no children', () => {
    const tree = computeScreenTree('s', ['s']);
    expect(tree.get('s')).toEqual({ children: [], parentId: null });
    expect(tree.size).toBe(1);
  });

  it('up to the fanout, everyone is a direct child of the sharer', () => {
    const tree = computeScreenTree('s', ['s', 'a', 'b', 'c']);
    expect([...tree.get('s')!.children].sort()).toEqual(['a', 'b', 'c']);
    for (const id of ['a', 'b', 'c']) {
      expect(tree.get(id)).toEqual({ children: [], parentId: 's' });
    }
  });

  it('above the fanout, peers become relays without exceeding the cap or minimum depth', () => {
    const ids = ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'g']; // full room (8)
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
    expect(tree.get('s')!.children).toHaveLength(3);
    // 7 viewers, 3 direct: 4 end up under relays — maximum depth 2.
    for (const id of ids.filter((id) => id !== 's')) {
      const parent = tree.get(id)!.parentId;
      expect(parent === 's' || tree.get(parent!)!.parentId === 's').toBe(true);
    }
    expect(leaves).toBe(4);
    const relayLoads = tree.get('s')!.children.map((id) => tree.get(id)!.children.length);
    expect(Math.max(...relayLoads) - Math.min(...relayLoads)).toBeLessThanOrEqual(1);
  });

  it('is deterministic: independent of the peers\' arrival order', () => {
    const shuffled = computeScreenTree('s', ['g', 'c', 's', 'a', 'f', 'b', 'e', 'd']);
    const sorted = computeScreenTree('s', ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect([...shuffled.entries()]).toEqual([...sorted.entries()]);
  });

  it('ignores the sharer in the viewer list', () => {
    const tree = computeScreenTree('s', ['a', 's', 'b']);
    expect([...tree.get('s')!.children].sort()).toEqual(['a', 'b']);
  });

  it('moves a child away from a persistently poor parent without replacing the relay cohort', () => {
    const ids = ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const before = computeScreenTree('s', ids);
    const childId = [...before].find(
      ([id, route]) => id !== 's' && route.parentId !== 's',
    )![0];
    const oldParent = before.get(childId)!.parentId!;
    const poorLinks = new Map([[childId, new Set([oldParent])]]);

    const after = computeScreenTree('s', ids, undefined, poorLinks);

    expect(after.get(childId)!.parentId).not.toBe(oldParent);
    expect(new Set(after.get('s')!.children)).toEqual(new Set(before.get('s')!.children));
  });

  it('uses a healthy relay when one direct link from the sharer is poor', () => {
    const poorLinks = new Map([['b', new Set(['s'])]]);

    const tree = computeScreenTree('s', ['s', 'a', 'b'], undefined, poorLinks);

    expect(tree.get('a')!.parentId).toBe('s');
    expect(tree.get('b')!.parentId).toBe('a');
  });

  it('makes a commonly poor peer a leaf before it can bottleneck a subtree', () => {
    const ids = ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const before = computeScreenTree('s', ids);
    const weakRelay = before.get('s')!.children[0]!;
    const reporters = ids.filter((id) => id !== 's' && id !== weakRelay).slice(0, 2);
    const poorLinks = new Map(reporters.map((id) => [id, new Set([weakRelay])]));

    const after = computeScreenTree('s', ids, undefined, poorLinks);

    expect(after.get('s')!.children).not.toContain(weakRelay);
    expect(after.get(weakRelay)!.children).toEqual([]);
  });

  it('uses a different stable order per share instead of loading the same relays every time', () => {
    const ids = ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const fromS = computeScreenTree('s', ids);
    const fromA = computeScreenTree('a', ids);

    expect(new Set(fromS.get('s')!.children)).not.toEqual(new Set(fromA.get('a')!.children));
  });
});
