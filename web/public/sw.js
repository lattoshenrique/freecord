/*
 * The service worker: what makes Freecord installable, and nothing more.
 *
 * A call is live by definition — there is no offline mode to build here, and
 * the room's state lives on the server. So this worker is deliberately the
 * smallest thing that earns its keep: it lets the browser offer "install", it
 * opens an installed app instantly from cache, and it shows the shell instead
 * of a dinosaur when the network is gone.
 *
 * The four rules it will not bend, each one a way this file could break the
 * product silently:
 *
 * 1. **Nothing under `/api/` or `/ws` is ever touched.** Those carry room
 *    state, the room counter, the download catalog and the page reader — a
 *    cached answer there is a wrong answer with no error attached, and
 *    `/api/sources` answers `no-store` on purpose: what somebody is about to
 *    watch is the one thing this project promises not to keep.
 * 2. **Cross-origin requests pass straight through.** The video tools load
 *    YouTube's iframe API, embeds and thumbnails from origins we do not
 *    version; freezing any of those in a cache of ours breaks them in a way
 *    nobody would think to blame on this file.
 * 3. **The document is never served cache-first.** This client speaks a
 *    protocol with the Worker, and a deploy changes both sides at once. A
 *    stale index.html is a client talking a protocol the server has stopped
 *    speaking — which does not look like a caching bug, it looks like a
 *    broken room. Only hashed assets under `/assets/`, whose name IS their
 *    content, are safe to answer from cache.
 * 4. **It does not take over on its own.** A new worker waits; the page asks
 *    it to activate only when nobody is in a call (see lib/pwa.ts).
 *
 * The build id arrives in the registration's query string, so every deploy
 * gets its own caches and `activate` drops the ones before it.
 */

const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = `freecord-shell-${BUILD}`;
const ASSET_CACHE = `freecord-assets-${BUILD}`;
const CACHES = [SHELL_CACHE, ASSET_CACHE];

/**
 * Every route answers the same SPA document, so one entry is the whole shell:
 * offline, `/r/abc` gets it too and the router reads the address bar itself.
 */
const SHELL_KEY = '/';

self.addEventListener('install', (event) => {
  // Fetched once here so the first visit is already survivable offline: the
  // fetch handler below only sees navigations from the second one onwards.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(SHELL_KEY, { cache: 'reload' })))
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('freecord-') && !CACHES.includes(name))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * The page's one way to say "now is a safe moment": a worker that skipped the
 * wait would swap the app under a live call.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'freecord:activate-update') {
    self.skipWaiting();
  }
});

/** Requests this worker is allowed to answer at all — see rules 1 and 2. */
function handled(request) {
  if (request.method !== 'GET') {
    return false;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }
  return !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/ws');
}

/** A response worth keeping: a plain 200 from our own origin. */
function storable(response) {
  return response.ok && response.status === 200 && !response.redirected && response.type === 'basic';
}

/**
 * An asset that is not the SPA fallback wearing its name.
 *
 * Both edges answer an unmatched path with index.html and a 200 — a
 * deliberate choice, so `/r/:slug` reaches the router. The cost is that a
 * request for an asset that is no longer there (an old page asking for the
 * bundle a deploy just replaced) comes back as a perfectly cacheable
 * document. Cache that under a `.js` URL and this worker keeps serving it
 * long after the deploy settles: the browser refuses it on MIME grounds and
 * the app fails to boot, with a cache we would have no reason to suspect.
 *
 * Nothing under `/assets/` is ever legitimately HTML, so the type decides it.
 */
function isAsset(response) {
  return !(response.headers.get('content-type') || '').startsWith('text/html');
}

/** Network first, and the cached shell only when there is no network at all. */
async function freshShell(request) {
  try {
    const response = await fetch(request);
    if (storable(response)) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_KEY, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(SHELL_KEY, { cacheName: SHELL_CACHE });
    if (cached) {
      return cached;
    }
    throw error;
  }
}

/** Cache first: the file's name contains its hash, so it cannot go stale. */
async function hashedAsset(request) {
  const cached = await caches.match(request, { cacheName: ASSET_CACHE });
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (storable(response) && isAsset(response)) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!handled(request)) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(freshShell(request));
    return;
  }
  if (new URL(request.url).pathname.startsWith('/assets/')) {
    event.respondWith(hashedAsset(request));
  }
});
