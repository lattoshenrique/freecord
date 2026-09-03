import { describe, expect, it } from 'vitest';
import { invertBox, invertTransform, sweepDeparted, visualBox } from '../src/lib/motion';

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('invertBox', () => {
  it('puts a tile that moved back where it was', () => {
    const invert = invertBox(box(0, 0, 200, 112), box(212, 0, 200, 112));
    expect(invert).toEqual({ dx: -212, dy: 0, sx: 1, sy: 1 });
  });

  it('carries the size change too, as a scale', () => {
    const invert = invertBox(box(0, 0, 400, 224), box(0, 0, 200, 112));
    expect(invert?.sx).toBeCloseTo(2);
    expect(invert?.sy).toBeCloseTo(2);
  });

  it('says nothing happened when nothing did', () => {
    expect(invertBox(box(10, 10, 200, 112), box(10, 10, 200, 112))).toBeNull();
  });

  it('ignores the browser rounding a box by half a pixel', () => {
    expect(invertBox(box(10, 10, 200, 112), box(10.4, 9.7, 200.2, 112.1))).toBeNull();
  });

  it('has nothing to undo for a box with no area (a tile still collapsed)', () => {
    expect(invertBox(box(0, 0, 0, 0), box(0, 0, 200, 112))).toBeNull();
    expect(invertBox(box(0, 0, 200, 112), box(0, 0, 200, 0))).toBeNull();
  });
});

describe('invertTransform', () => {
  it('writes the transform the animation starts from', () => {
    expect(invertTransform({ dx: -212, dy: 8, sx: 2, sy: 1.5 })).toBe(
      'translate(-212.00px, 8.00px) scale(2.0000, 1.5000)',
    );
  });
});

describe('visualBox', () => {
  it('is the layout box when nothing is transforming it', () => {
    expect(visualBox(box(10, 20, 200, 112), { a: 1, d: 1, e: 0, f: 0 })).toEqual(box(10, 20, 200, 112));
  });

  it('reads a tile halfway through a move as where it is being drawn', () => {
    // Part way back towards a position 100px to the left, at a tenth larger.
    const seen = visualBox(box(300, 0, 200, 112), { a: 1.1, d: 1.1, e: -50, f: 0 });
    expect(seen.x).toBe(250);
    expect(seen.y).toBe(0);
    expect(seen.width).toBeCloseTo(220);
    expect(seen.height).toBeCloseTo(123.2);
  });
});

const ghost = (id: string, at: number) => ({ item: { id }, at });

describe('sweepDeparted', () => {
  it('keeps whoever is still inside their fade, and says when to look again', () => {
    const swept = sweepDeparted([ghost('a', 0), ghost('b', 100)], 150, 220);
    expect(swept.kept.map((g) => g.item.id)).toEqual(['a', 'b']);
    expect(swept.nextIn).toBe(70);
  });

  it('drops the ones whose time is up and waits on the next', () => {
    const swept = sweepDeparted([ghost('a', 0), ghost('b', 100)], 260, 220);
    expect(swept.kept.map((g) => g.item.id)).toEqual(['b']);
    expect(swept.nextIn).toBe(60);
  });

  it('says nothing is left to wait for once the row has let go', () => {
    expect(sweepDeparted([ghost('a', 0)], 220, 220)).toEqual({ kept: [], nextIn: null });
    expect(sweepDeparted([], 0, 220)).toEqual({ kept: [], nextIn: null });
  });

  /*
   * The one that mattered: a look that lands a hair early drops nobody, and
   * has to come back anyway. Without the second look the room stood there
   * holding a face who had left — and, since the wedge was the oldest ghost,
   * everyone who left after them.
   */
  it('asks for another look when it lands early, however early', () => {
    const early = sweepDeparted([ghost('a', 0)], 219.6, 220);
    expect(early.kept).toHaveLength(1);
    expect(early.nextIn).toBeCloseTo(0.4);
    expect(sweepDeparted([ghost('a', 0)], 0, 220).nextIn).toBe(220);
  });
});
