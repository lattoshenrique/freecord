/**
 * The room's motion, in the three shapes CSS alone cannot do.
 *
 * Everything that only changes colour, opacity or a border is a plain CSS
 * transition and stays in the stylesheet. What is left needs React's help,
 * because it is about elements that are being added to or taken out of the
 * page, or that move because something else did:
 *
 *  - `usePresence`  — keeps a panel mounted for the length of its way out,
 *    so a menu, the chat or a badge can leave the way it arrived instead of
 *    blinking off.
 *  - `useDeparting` — the same idea for a list: a face that left the call
 *    stays in the row long enough to fade.
 *  - `useFlip`      — the tiles' reflow. When the grid re-lays out (someone
 *    joins, a screen goes up, the layout key is pressed) every tile is put
 *    back where it was and then let go, so the row slides instead of
 *    jumping. Position and size both, measured after the browser has done
 *    the layout — no geometry is computed twice.
 *
 * All three go quiet under `prefers-reduced-motion`, which is the same
 * promise the stylesheet's own media query makes.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * How long each family of motion lasts, named once so the stylesheet and the
 * timers here cannot drift apart. The stylesheet declares the same numbers as
 * custom properties (--dur-*); these are their milliseconds.
 */
export const MOTION = {
  /** A key lighting up, a colour changing: fast enough to feel like a press. */
  quick: 150,
  /** A bubble, a badge, a chip arriving. */
  pop: 220,
  /** A panel, a menu, the stage. */
  panel: 260,
} as const;

/**
 * Nothing to animate for: the page is not on screen.
 *
 * A hidden document's timeline does not advance, so an animation started now
 * would sit on its first frame — the tile inverted back to where it used to
 * be — until somebody looks. A room left open in a background tab reflows
 * all the time (people join, screens go up), and the first thing that person
 * would see on coming back is the room as it was, snapping into the room as
 * it is. Move the tiles straight there instead; nobody watched them go.
 */
function unwatched(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

/** Whether this device (or this person) asked for less movement. */
export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Mount for as long as it takes to leave.
 *
 * `open` is the truth; `mounted` is what React should render. While the two
 * disagree the element is on its way out and `leaving` is true, which is the
 * hook onto the exit animation in CSS (`[data-leaving='true']`).
 */
export function usePresence(open: boolean, ms: number = MOTION.panel): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (reducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open, ms]);
  return { mounted: mounted || open, leaving: mounted && !open };
}

/**
 * A list that lets go slowly: whatever disappears from `items` is kept, in
 * the place it held, with `leaving: true`, until its animation is over.
 *
 * Identity is the `id`, so an item that comes back before the timer fires is
 * simply alive again — nobody is drawn twice.
 *
 * The ghost is worked out while rendering, not in an effect afterwards. An
 * effect would be one render too late, and that render is the whole problem:
 * the row would lay itself out once without the face who left, and then
 * again with the ghost back in it — a bounce, and a tile React had already
 * thrown away and built again, entrance animation and all. Deriving it here
 * means the row never sees the state where somebody is simply missing.
 */
export function useDeparting<T extends { id: string }>(
  items: readonly T[],
  ms: number = MOTION.pop,
): (T & { leaving?: boolean })[] {
  const previous = useRef<readonly T[]>(items);
  const ghosts = useRef<{ item: T; at: number }[]>([]);
  // Nothing here is state except the moment a ghost's time is up, which is
  // the only thing that has to bring the room back to draw itself.
  const [, expire] = useState(0);

  if (previous.current !== items) {
    const live = new Set(items.map((item) => item.id));
    const gone = reducedMotion() ? [] : previous.current.filter((item) => !live.has(item.id));
    previous.current = items;
    const at = Date.now();
    ghosts.current = [
      // Anyone who came back is alive again, and anyone leaving again starts
      // their fade from now: never two entries for one id.
      ...ghosts.current.filter((g) => !live.has(g.item.id) && !gone.some((item) => item.id === g.item.id)),
      ...gone.map((item) => ({ item, at })),
    ];
  }

  const oldest = ghosts.current.length > 0 ? Math.min(...ghosts.current.map((g) => g.at)) : null;
  useEffect(() => {
    if (oldest === null) {
      return;
    }
    const timer = setTimeout(
      () => {
        const kept = ghosts.current.filter((g) => Date.now() - g.at < ms);
        if (kept.length !== ghosts.current.length) {
          ghosts.current = kept;
          expire((n) => n + 1);
        }
      },
      Math.max(0, oldest + ms - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [oldest, ms]);

  if (ghosts.current.length === 0) {
    return items as (T & { leaving?: boolean })[];
  }
  return [
    ...(items as (T & { leaving?: boolean })[]),
    ...ghosts.current.map((g) => ({ ...g.item, leaving: true })),
  ];
}

export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** The transform that puts `after` back on top of `before`. */
export type Invert = { readonly dx: number; readonly dy: number; readonly sx: number; readonly sy: number };

/**
 * What it takes to undo a move — or nothing, when the box barely budged.
 *
 * Sub-pixel differences are the browser rounding, not motion: animating them
 * costs a composited layer per tile and shows nobody anything.
 */
export function invertBox(before: Box, after: Box, epsilon = 1): Invert | null {
  if (after.width <= 0 || after.height <= 0 || before.width <= 0 || before.height <= 0) {
    return null;
  }
  const dx = before.x - after.x;
  const dy = before.y - after.y;
  const sx = before.width / after.width;
  const sy = before.height / after.height;
  const moved = Math.abs(dx) > epsilon || Math.abs(dy) > epsilon;
  const resized = Math.abs(before.width - after.width) > epsilon || Math.abs(before.height - after.height) > epsilon;
  return moved || resized ? { dx, dy, sx, sy } : null;
}

/**
 * The box as the eye has it: the layout box with a transform already on it.
 *
 * `a`/`d` are the matrix's scale and `e`/`f` its translation — everything an
 * inverted FLIP transform ever puts on a tile.
 */
export function visualBox(layout: Box, matrix: { a: number; d: number; e: number; f: number }): Box {
  return {
    x: layout.x + matrix.e,
    y: layout.y + matrix.f,
    width: layout.width * matrix.a,
    height: layout.height * matrix.d,
  };
}

/** The transform string an inversion is applied with. */
export function invertTransform({ dx, dy, sx, sy }: Invert): string {
  return `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}

/**
 * Where an element sits in the layout, transforms and scrolling left out.
 *
 * `getBoundingClientRect` cannot be used for this: it reports the box the
 * eye sees, which for a tile already sliding somewhere is its position mid
 * flight — measure with that and every second reflow computes its move from
 * a position that was never a layout at all. The offsets are the layout, and
 * they are the same coordinates for every child of one container, which is
 * all a difference needs.
 */
function layoutBox(child: HTMLElement): Box {
  return { x: child.offsetLeft, y: child.offsetTop, width: child.offsetWidth, height: child.offsetHeight };
}

/** Where a child is being drawn right now, transform included. */
function currentBox(child: HTMLElement, layout: Box): Box {
  const transform = getComputedStyle(child).transform;
  if (!transform || transform === 'none' || typeof DOMMatrixReadOnly !== 'function') {
    return layout;
  }
  try {
    return visualBox(layout, new DOMMatrixReadOnly(transform));
  } catch {
    return layout;
  }
}

/**
 * FLIP over a container's element children.
 *
 * Returns the ref to put on the container. Children are tracked by their DOM
 * node — React already reuses a node for a given key, so nothing has to be
 * labelled for this to know that the tile now on the left is the one that
 * used to be on the right. A node seen for the first time is left alone: its
 * arrival is the stylesheet's job.
 *
 * A reflow that lands while a tile is still moving does NOT restart it from
 * halfway: the origin held for that tile is where it last stood still, and
 * the new animation runs from there to wherever it has to be now. This is
 * not an edge case — the grid sizes its tiles from a measurement, so every
 * change arrives as two renders in a row, and the first of them lays the
 * tiles out at the new count in the old size. Starting the second move from
 * that in-between would show it.
 */
export function useFlip<T extends HTMLElement = HTMLElement>(
  ms: number = MOTION.panel,
): (el: T | null) => void {
  const container = useRef<T | null>(null);
  /** Where each child last stood still. */
  const origin = useRef(new WeakMap<Element, Box>());
  const running = useRef(new WeakMap<Element, Animation>());
  /** Where the animation now running is taking it. */
  const target = useRef(new WeakMap<Element, Box>());
  const setRef = useCallback((el: T | null) => {
    container.current = el;
  }, []);

  useLayoutEffect(() => {
    const el = container.current;
    if (!el || typeof el.animate !== 'function') {
      return;
    }
    const quiet = reducedMotion() || unwatched();
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      const after = layoutBox(child);
      const before = origin.current.get(child);
      const inFlight = running.current.get(child);
      if (!before || quiet) {
        origin.current.set(child, after);
        continue;
      }
      // A tile already on its way to exactly here is left alone. Without
      // this the room would restart the move on every render that happens
      // to land during it — and the room renders often: a latency reading,
      // somebody starting to speak. The tile would crawl, or never arrive.
      if (inFlight && !invertBox(target.current.get(child) ?? after, after)) {
        continue;
      }
      const invert = invertBox(before, after);
      if (!invert) {
        // Nowhere to go: whatever was moving has arrived, or never left.
        if (!inFlight) {
          origin.current.set(child, after);
        }
        continue;
      }
      // Interrupting: the new move starts from where the tile is at this
      // instant, not from where the last one began, so a second change
      // mid-flight bends the path instead of throwing it back.
      const from = inFlight ? invertBox(currentBox(child, after), after) : invert;
      // Cancelling and starting again happen in the same layout effect, so
      // the frame in between — the one where the tile is at its new place
      // with no transform on it — is never painted.
      inFlight?.cancel();
      const animation = child.animate(
        [{ transform: invertTransform(from ?? invert) }, { transform: 'none' }],
        { duration: ms, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      running.current.set(child, animation);
      target.current.set(child, after);
      animation.finished
        .then(() => {
          if (running.current.get(child) === animation) {
            running.current.delete(child);
            target.current.delete(child);
            // It stands where it was sent: that is the origin from now on.
            origin.current.set(child, layoutBox(child));
          }
        })
        .catch(() => undefined);
    }
  });

  return setRef;
}
