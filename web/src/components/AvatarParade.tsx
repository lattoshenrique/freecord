import { useEffect, useRef, useState, type RefObject } from 'react';
import { hashString, randomNickname } from '../lib/identity';
import Avatar from './Avatar';
import './avatar-parade.css';

/**
 * A few mascots loose along the bottom of the doorstep: the kind of faces
 * the guest is about to join, each drawn from a name nobody has, so a fresh
 * crowd is out every time the page opens. They are not in tiles — no
 * ground, no frame — and they are not on rails: each one walks at its own
 * pace, speeding up and slowing down, stops to look about, hops, keeps a
 * little distance from whoever is ahead, turns back at the edges. When two
 * meet they stop, face each other and greet, and sometimes one goes on
 * with the other. They notice a pointer that comes close. Some are asleep
 * where they stand — a few from the start, if the dice say so, and any one
 * that has stood about long enough — and sleep until they have had enough,
 * until a pointer comes close, or until they are picked. And any one of
 * them can be picked: it leaps up into the guest's own avatar and its name
 * goes into the field, where it is as free to be changed as the name that
 * was there. A newcomer wanders in from the edge to fill the gap.
 *
 * The walk is a small simulation on requestAnimationFrame writing straight
 * to the DOM: where each one is, which way it faces and what it is doing.
 * React only draws the roster, and redraws it when someone leaves or
 * arrives. Per frame nothing re-renders; the gaits are CSS.
 */

type State =
  | 'walk'
  | 'stand'
  | 'hop'
  | 'greet'
  | 'notice'
  | 'sleep'
  /** Startled awake: a jump, then on with the day. */
  | 'wake'
  /** Picked: mid-air on the way into the guest's avatar. Out of the simulation. */
  | 'leap';

interface Walker {
  id: number;
  name: string;
  /** Width of the mascot's box, in px. */
  size: number;
  /** Left edge, in px from the ground's left. */
  x: number;
  /** 1 faces right, -1 faces left. */
  dir: 1 | -1;
  /** Walking pace, px per second, when there is nothing to slow it down. */
  pace: number;
  /** Current velocity, px per second, signed. Eases toward what it wants. */
  v: number;
  state: State;
  /** Drawn asleep: mask on, z's going up. Follows the state, a render behind. */
  asleep: boolean;
  /** When the current state ends, in ms of the frame clock. 0: open-ended. */
  until: number;
  /** One it is walking along with for a while, after a greeting. */
  friend: Walker | null;
  /** No greeting again before this, so two friends do not stall each other forever. */
  greetAgainAt: number;
  /** No reacting to the pointer again before this. */
  noticeAgainAt: number;
  el: HTMLDivElement | null;
}

const COUNT = 7;
let nextId = 1;

function newcomer(): Walker {
  const name = randomNickname();
  // Build follows from the name: a face walks like it looks.
  const seed = hashString(name);
  return {
    id: nextId++,
    name,
    size: 44 + (((seed >>> 4) % 100) / 100) * 28,
    x: -1,
    dir: (seed & 1) === 1 ? -1 : 1,
    pace: 20 + (((seed >>> 20) % 100) / 100) * 28,
    v: 0,
    state: 'walk',
    asleep: false,
    until: 0,
    friend: null,
    greetAgainAt: 0,
    noticeAgainAt: 0,
    el: null,
  };
}

function crowd(): Walker[] {
  const walkers: Walker[] = [];
  for (let i = 0; i < COUNT; i++) {
    const walker = newcomer();
    // Some of them were here before the guest and have dozed off.
    if (Math.random() < 0.16) {
      walker.state = 'sleep';
      walker.asleep = true;
      walker.until = performance.now() + 15000 + Math.random() * 30000;
    }
    walkers.push(walker);
  }
  return walkers;
}

/** Spaces the crowd out along the ground, each a little off its mark. */
function spread(walkers: Walker[], width: number) {
  walkers.forEach((walker, i) => {
    const seed = hashString(walker.name);
    walker.x = ((i + ((seed >>> 12) % 100) / 100) / COUNT) * Math.max(0, width - walker.size);
  });
}

const centre = (walker: Walker) => walker.x + walker.size / 2;

/** Writes what changed to the element: where it is, which way it faces, what it is doing. */
function paint(walker: Walker) {
  const { el } = walker;
  if (!el) {
    return;
  }
  el.style.transform = `translateX(${walker.x.toFixed(1)}px)`;
  el.dataset.dir = walker.dir === 1 ? 'right' : 'left';
  el.dataset.state = walker.state;
}

function goOn(walker: Walker, now: number, state: State, length: number) {
  walker.state = state;
  walker.until = now + length;
}

/** A jolt awake: the jump, then walking. Says whether the drawing must change. */
function wake(walker: Walker, now: number): boolean {
  if (walker.state !== 'sleep') {
    return false;
  }
  walker.asleep = false;
  goOn(walker, now, 'wake', 700);
  return true;
}

interface Pointer {
  x: number;
  /** Distance above the ground line, in px; negative below it. */
  height: number;
  /** Over the page at all: a pointer that left the window is nowhere. */
  present: boolean;
}

/** One frame. Returns true when someone fell asleep or woke: the faces must be redrawn. */
function step(walkers: Walker[], now: number, dt: number, width: number, pointer: Pointer): boolean {
  const seconds = dt / 1000;
  const ease = Math.min(1, dt / 240);
  let redraw = false;

  for (const walker of walkers) {
    if (walker.state === 'leap') {
      continue;
    }
    if (walker.until && now >= walker.until) {
      // Whatever it was doing is over. Out of a greeting the two part: one
      // often turns and goes the other way, and now and then one falls in
      // beside the other for a stretch.
      if (walker.state === 'greet') {
        const roll = Math.random();
        if (roll < 0.35 && walker.friend && walker.friend.state !== 'leap') {
          walker.dir = walker.friend.dir;
          goOn(walker, now, 'walk', 4000 + Math.random() * 5000);
          walker.state = 'walk';
        } else {
          if (roll < 0.7) {
            walker.dir = walker.dir === 1 ? -1 : 1;
          }
          walker.friend = null;
          goOn(walker, now, 'walk', 0);
        }
      } else if (walker.state === 'walk') {
        // A stretch beside a friend ends.
        walker.friend = null;
        walker.until = 0;
      } else if (walker.state === 'stand' && Math.random() < 0.14) {
        // Stood about long enough: dozes off where it is.
        walker.asleep = true;
        goOn(walker, now, 'sleep', 12000 + Math.random() * 25000);
        redraw = true;
      } else if (walker.state === 'sleep') {
        redraw = wake(walker, now) || redraw;
      } else {
        goOn(walker, now, 'walk', 0);
      }
    }

    // What it wants to be doing with its feet.
    let want = 0;
    if (walker.state === 'walk') {
      want = walker.pace;
      if (walker.friend && walker.friend.state === 'walk') {
        // Keep step with the friend, and a little behind rather than on top.
        walker.dir = walker.friend.dir;
        const gap = (centre(walker.friend) - centre(walker)) * walker.dir;
        const room = (walker.size + walker.friend.size) * 0.55;
        want = Math.abs(walker.friend.v) * (gap < room * 0.8 ? 0.85 : gap > room * 1.6 ? 1.2 : 1);
      } else {
        // Personal space: whoever is ahead and close sets the pace, and a
        // walker held up too long turns round or hops past.
        for (const other of walkers) {
          if (other === walker || other.state === 'leap') {
            continue;
          }
          const gap = (centre(other) - centre(walker)) * walker.dir;
          const room = (walker.size + other.size) * 0.5;
          if (gap > 0 && gap < room * 1.4 && other.state === 'sleep') {
            // On tiptoe past a sleeper.
            want = Math.min(want, walker.pace * 0.4);
          } else if (gap > 0 && gap < room) {
            const theirs = other.dir === walker.dir ? Math.abs(other.v) : 0;
            want = Math.min(want, theirs * 0.95);
            if (theirs < 4 && Math.random() < 0.012) {
              if (Math.random() < 0.5) {
                walker.dir = walker.dir === 1 ? -1 : 1;
              } else {
                goOn(walker, now, 'hop', 520);
                want = walker.pace;
              }
            }
          }
        }
      }
      // Now and then: a pause to look about, a hop, or a change of mind.
      const roll = Math.random();
      if (roll < 0.0022) {
        goOn(walker, now, 'stand', 1200 + Math.random() * 2600);
      } else if (roll < 0.0034) {
        goOn(walker, now, 'hop', 520);
      } else if (roll < 0.004 && !walker.friend) {
        walker.dir = walker.dir === 1 ? -1 : 1;
      }
    } else if (walker.state === 'hop') {
      // A hop carries the walker on.
      want = walker.pace * 1.4;
    } else if (walker.state === 'stand') {
      // Standing, it looks the other way now and then.
      if (Math.random() < 0.006) {
        walker.dir = walker.dir === 1 ? -1 : 1;
      }
    }

    // Someone leaning in: a walker turns to the pointer and gives a little
    // jump; a sleeper is startled awake.
    if (
      pointer.present &&
      (walker.state === 'walk' || walker.state === 'stand' || walker.state === 'sleep') &&
      now >= walker.noticeAgainAt &&
      pointer.height > -20 &&
      pointer.height < 160 &&
      Math.abs(pointer.x - centre(walker)) < walker.size * 1.4
    ) {
      walker.dir = pointer.x > centre(walker) ? 1 : -1;
      walker.friend = null;
      if (walker.state === 'sleep') {
        redraw = wake(walker, now) || redraw;
      } else {
        goOn(walker, now, 'notice', 900 + Math.random() * 600);
      }
      walker.noticeAgainAt = now + 3500 + Math.random() * 3000;
      want = 0;
    }

    // Feet: ease toward the pace wanted, then move.
    walker.v += (want * walker.dir - walker.v) * ease;
    walker.x += walker.v * seconds;
    // The edges turn it back. A newcomer starts outside and only turns
    // once it is in.
    if (walker.dir === -1 && walker.x <= 0) {
      walker.x = 0;
      walker.dir = 1;
      walker.v = 0;
      walker.friend = null;
    } else if (walker.dir === 1 && walker.x >= width - walker.size) {
      walker.x = width - walker.size;
      walker.dir = -1;
      walker.v = 0;
      walker.friend = null;
    }
  }

  // Meetings: two that are both walking toward each other and have come
  // within reach stop, turn to each other and greet. A pair that has just
  // done so walks on past each other for a while instead.
  for (let i = 0; i < walkers.length; i++) {
    const a = walkers[i]!;
    if (a.state !== 'walk' || now < a.greetAgainAt || a.friend) {
      continue;
    }
    for (let j = i + 1; j < walkers.length; j++) {
      const b = walkers[j]!;
      if (b.state !== 'walk' || now < b.greetAgainAt || b.friend) {
        continue;
      }
      const reach = (a.size + b.size) * 0.45;
      if (Math.abs(centre(a) - centre(b)) < reach) {
        const length = 1400 + Math.random() * 900;
        for (const [self, other] of [
          [a, b],
          [b, a],
        ] as const) {
          goOn(self, now, 'greet', length);
          self.greetAgainAt = now + length + 7000 + Math.random() * 7000;
          self.friend = other;
          self.dir = centre(other) > centre(self) ? 1 : -1;
          self.v = 0;
        }
        break;
      }
    }
  }

  for (const walker of walkers) {
    if (walker.state !== 'leap') {
      paint(walker);
    }
  }
  return redraw;
}

export default function AvatarParade({
  target,
  onPick,
}: {
  /** The guest's own avatar: where a picked mascot leaps to. */
  target: RefObject<Element | null>;
  /** A mascot has landed in it: this is its name. */
  onPick: (name: string) => void;
}) {
  const [roster, setRoster] = useState(crowd);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const groundRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<Pointer>({ x: 0, height: 0, present: false });
  const [lifting, setLifting] = useState(false);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The ground's own width, not the window's: it is what the crowd is
    // laid out on, and it is zero in a tab that has not been shown yet.
    // Not placed until there is somewhere to stand, and placed again when
    // the ground changes size.
    let width = 0;
    const measure = () => {
      const next = groundRef.current?.clientWidth ?? 0;
      if (next === width) {
        return;
      }
      const first = width === 0;
      width = next;
      if (first) {
        spread(rosterRef.current, width);
      }
      for (const walker of rosterRef.current) {
        walker.x = Math.min(walker.x, Math.max(0, width - walker.size));
        paint(walker);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    if (still) {
      // A crowd standing about, where the walk would have put them.
      return () => window.removeEventListener('resize', measure);
    }

    const onPointer = (event: PointerEvent) => {
      const ground = groundRef.current?.getBoundingClientRect();
      pointerRef.current = ground
        ? { x: event.clientX - ground.left, height: ground.bottom - event.clientY, present: true }
        : { x: 0, height: 0, present: false };
    };
    const onLeave = () => {
      pointerRef.current = { x: 0, height: 0, present: false };
    };
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerdown', onPointer);
    document.addEventListener('pointerleave', onLeave);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A tab that was in the background comes back with one huge dt:
      // clamp it so nobody teleports.
      const dt = Math.min(now - last, 50);
      last = now;
      measure();
      if (width > 0 && step(rosterRef.current, now, dt, width, pointerRef.current)) {
        // Same people, some of them now drawn asleep or awake.
        setRoster((current) => [...current]);
      }
      frame = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', measure);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  // Someone leaves; someone else wanders in from an edge a moment later.
  const replace = (gone: Walker) => {
    setRoster((current) => current.filter((walker) => walker !== gone));
    window.setTimeout(() => {
      const width = groundRef.current?.clientWidth ?? 0;
      const arriving = newcomer();
      arriving.dir = Math.random() < 0.5 ? 1 : -1;
      arriving.x = arriving.dir === 1 ? -arriving.size : width;
      setRoster((current) => [...current, arriving]);
    }, 1200 + Math.random() * 2000);
  };

  const pick = (walker: Walker) => {
    const from = walker.el;
    const to = target.current;
    if (walker.state === 'leap') {
      return;
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!from || !to || still || typeof from.animate !== 'function') {
      pickRef.current(walker.name);
      replace(walker);
      return;
    }
    walker.state = 'leap';
    walker.until = 0;
    walker.friend = null;
    if (walker.asleep) {
      // Picked in its sleep: it wakes on the way up.
      walker.asleep = false;
      setRoster((current) => [...current]);
    }
    paint(walker);
    setLifting(true);
    // Up and over: from where it stands to the middle of the guest's
    // avatar, on an arc, growing to that avatar's size on the way.
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const scale = b.width / a.width;
    const x = walker.x;
    const flight = from.animate(
      [
        { transform: `translate(${x}px, 0) scale(1)`, offset: 0 },
        {
          transform: `translate(${x + dx * 0.45}px, ${dy - 90}px) scale(${(1 + scale) / 2})`,
          offset: 0.55,
        },
        { transform: `translate(${x + dx}px, ${dy}px) scale(${scale})`, opacity: 1, offset: 0.97 },
        { transform: `translate(${x + dx}px, ${dy}px) scale(${scale})`, opacity: 0, offset: 1 },
      ],
      { duration: 720, easing: 'cubic-bezier(0.35, 0, 0.25, 1)', fill: 'forwards' },
    );
    flight.finished
      .catch(() => undefined)
      .then(() => {
        setLifting(false);
        pickRef.current(walker.name);
        replace(walker);
      });
  };

  return (
    <div className={`parade${lifting ? ' lifting' : ''}`} aria-hidden="true" ref={groundRef}>
      {roster.map((walker) => (
        <div
          key={walker.id}
          className="parade-walker"
          style={{ width: `${walker.size}px`, height: `${walker.size}px` }}
          ref={(el) => {
            walker.el = el;
            if (el) {
              paint(walker);
            }
          }}
          onClick={() => pick(walker)}
        >
          <div className="parade-body">
            <Avatar
              name={walker.name}
              className="parade-face"
              micOff={walker.asleep}
              deafened={walker.asleep}
              bare
            />
          </div>
        </div>
      ))}
    </div>
  );
}
