import { flushSync } from 'react-dom';

/**
 * The way in, run as one move.
 *
 * Three screens stand between a click and a room — the home, the doorstep,
 * the room itself — and the same three things are on all of them: the mark,
 * the room's name, and the one lit button. A hero transition is what makes
 * them the *same* things rather than three drawings of them: the browser
 * photographs both screens, and every piece named in hero.css flies from
 * where it was to where it is going while the rest cross-fades underneath.
 *
 * Everything about how it looks lives in hero.css. This is only the switch.
 */

type ViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
};

type StartViewTransition = (callback: () => void) => ViewTransition;

/**
 * The flight currently in the air, and every one queued behind it.
 *
 * The legs of the way in can be a hundred milliseconds apart — the room
 * answers while the doorstep is still on its way out — and a second
 * transition started on top of a first does not blend with it: it cancels
 * it, the pieces jump to where they were headed, and the screen blinks
 * between the two captures. So each leg waits for the one before it to
 * land. The wait is bounded by the transition itself, half a second, and
 * the screen it is holding back is a screen that says it is still working.
 */
let landed: Promise<void> = Promise.resolve();

/**
 * Where the browser has no view transitions (Firefox before 144, older
 * Safari) and where motion is unwelcome, the update simply happens. Nothing
 * downstream depends on the transition running: the screens are the same
 * either way, they just cut instead of moving.
 */
export function heroTransition(update: () => void): void {
  const start = (document as unknown as { startViewTransition?: StartViewTransition })
    .startViewTransition;
  if (typeof start !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }

  // Nothing in the air: this resolves on the next microtask, so the first
  // leg still leaves within the click that asked for it.
  landed = landed.then(() => fly(start, update));
}

function fly(start: StartViewTransition, update: () => void): Promise<void> {
  const transition = start.call(document, () => {
    /*
     * Inside the callback the old screen has already been photographed, so
     * settling the brand here cannot make it jump on its way out. From now
     * on the screens carry the mark and the name between them, and neither
     * introduces itself again — see [data-hero-settled] in hero.css.
     */
    document.documentElement.dataset.heroSettled = 'true';
    /*
     * The new screen is photographed on the frame after this returns, and
     * React would not have rendered by then if we left it to its own
     * schedule: the transition would capture the screen we are leaving
     * twice and nothing would move.
     */
    flushSync(update);
  });

  /*
   * A transition can be dropped on the floor — the tab goes to the
   * background mid-flight, or a second one starts on top of this one — and
   * then these reject. The screen change itself has already happened by
   * then; there is nothing to recover, and nothing to say about it either,
   * so we take the rejection rather than leave it unhandled in the console.
   */
  const shrug = () => {};
  transition.ready.catch(shrug);
  transition.updateCallbackDone.catch(shrug);
  // `finished` settles when the transition ends *or* is dropped, so the
  // queue always moves on, even when nothing was ever drawn.
  return transition.finished.catch(shrug);
}
