import { lazy, useState } from 'react';

/**
 * The room page, loaded on demand — and, when we know it is coming, loaded
 * before it is asked for.
 *
 * The room is the biggest chunk in the app (the whole of WebRTC hangs off
 * it), so only people who join a room download it. That is worth keeping.
 * But a hero transition photographs the screen on the frame after the route
 * changes, and a route that is still fetching its code shows the blank
 * Suspense fallback on exactly that frame: the mark would fly into nothing.
 *
 * So the home warms the chunk before it navigates (`preloadRoomPage`), and
 * once it is warm the route renders it outright — no lazy, no boundary, no
 * frame in between. Someone who opens an invite link cold still gets the
 * ordinary lazy path, with no transition to spoil.
 */

type RoomModule = typeof import('./RoomPage');

let warm: RoomModule | null = null;

/** Fetch the room chunk and remember it. Safe to call as often as you like:
 *  the second call is the module registry handing back what it already has. */
export function preloadRoomPage(): Promise<unknown> {
  return import('./RoomPage').then((module) => {
    warm = module;
    return module;
  });
}

const LazyRoomPage = lazy(() => import('./RoomPage'));

export default function RoomRoute() {
  /*
   * Decided once, at mount: swapping between the two forms mid-life would
   * change the element type under React and remount the page, throwing away
   * the name and the devices someone had already chosen on the doorstep.
   */
  const [eager] = useState(() => warm);

  if (eager) {
    const RoomPage = eager.default;
    return <RoomPage />;
  }
  return <LazyRoomPage />;
}
